"""Section 5 -- automated flags, ranked by severity and capped at 7."""

import statistics
from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from typing import Any

from analysis_core.aggregation import (
    campaign_tokens,
    campaigns_of,
    export_for,
    metric_total,
    safe_ratio,
)
from analysis_core.checks.google import GoogleAuditCheckId, run_google_checks
from analysis_core.checks.meta import MetaAuditCheckId, run_meta_checks
from analysis_core.checks.models import CheckResult
from analysis_core.models import (
    AnalysisInput,
    FindingsSection,
    ParsedExport,
    SectionStatus,
)
from analysis_core.sections.roas_decomposition import (
    LOW_CONFIDENCE_MESSAGE,
    build_roas_decomposition_section,
)
from app.core.enums.health_check import HealthCheckSeverity, HealthCheckStatus
from app.core.metrics import MetricId

SECTION_TITLE = "Automated Flags"

_MAX_FLAGS = 7
_BRAND_DOMINANCE_THRESHOLD = Decimal("0.25")
_SUSPICIOUS_ROAS_THRESHOLD = Decimal("20")
_MEANINGFUL_SPEND_SHARE = Decimal("0.02")
_CTR_OUTLIER_MEDIAN_SHARE = Decimal("0.25")
_REQUIRES_BOTH_EXPORTS = "requires both exports"

_SEVERITY_RANK: dict[HealthCheckSeverity, int] = {
    HealthCheckSeverity.INFO: 0,
    HealthCheckSeverity.WARNING: 1,
    HealthCheckSeverity.BLOCKER: 2,
}

_ZERO_RETURN_IMPLICATION = (
    "This spend is being lost with no attributed return to show for it."
)
_ZERO_RETURN_ACTION = (
    "Pause or restructure these campaigns, and confirm conversion tracking is "
    "firing correctly for them."
)
_SPEND_CONCENTRATION_IMPLICATION = (
    "Most of the account's performance is riding on a single campaign, so the "
    "rest of the account can't be judged independently of it."
)
_SPEND_CONCENTRATION_ACTION = (
    "Review whether this concentration is a deliberate bet or an unmanaged "
    "default, and consider diversifying spend."
)
_BRAND_DOMINANCE_IMPLICATION = (
    "A high brand share can inflate how effective the account looks, since "
    "brand search tends to convert regardless of ad spend."
)
_BRAND_DOMINANCE_ACTION = (
    "Ask what Google's performance would look like with brand campaigns "
    "excluded before crediting the account for it."
)
_SUSPICIOUS_IMPLICATION = (
    "A return this high is more consistent with an attribution or tracking "
    "issue than genuine performance."
)
_SUSPICIOUS_ACTION = (
    "Have someone check the conversion tracking and attribution setup for "
    "these campaigns before trusting the number."
)
_CROSS_PLATFORM_IMPLICATION = (
    "This may mean a theme is only running on one platform, or simply that "
    "naming diverged between them -- it is a naming signal, not a structural finding."
)
_CROSS_PLATFORM_ACTION = (
    "Confirm with the account owner whether these themes are intentionally "
    "single-platform."
)
_CTR_OUTLIER_IMPLICATION = (
    "Low CTR at real spend usually points to weak creative or mistargeting "
    "relative to the rest of the account."
)
_CTR_OUTLIER_ACTION = "Review ad creative and targeting for these campaigns."


class AutomatedFlagId(str, Enum):
    """Section 5's own flag ids; never added to HealthCheckId (no live check emits one)."""

    ZERO_RETURN_SPEND = "flag.zero_return_spend"
    SPEND_CONCENTRATION = "flag.spend_concentration"
    BRAND_DOMINANCE = "flag.brand_dominance"
    SUSPICIOUS_CONVERSION_VALUES = "flag.suspicious_conversion_values"
    CROSS_PLATFORM_ABSENCE = "flag.cross_platform_absence"
    CTR_OUTLIER = "flag.ctr_outlier"


@dataclass(frozen=True)
class _RuleCopy:
    severity: HealthCheckSeverity
    implication: str
    action: str


_RULE_COPY: dict[AutomatedFlagId, _RuleCopy] = {
    AutomatedFlagId.ZERO_RETURN_SPEND: _RuleCopy(
        HealthCheckSeverity.WARNING, _ZERO_RETURN_IMPLICATION, _ZERO_RETURN_ACTION
    ),
    AutomatedFlagId.SPEND_CONCENTRATION: _RuleCopy(
        HealthCheckSeverity.WARNING,
        _SPEND_CONCENTRATION_IMPLICATION,
        _SPEND_CONCENTRATION_ACTION,
    ),
    AutomatedFlagId.BRAND_DOMINANCE: _RuleCopy(
        HealthCheckSeverity.INFO, _BRAND_DOMINANCE_IMPLICATION, _BRAND_DOMINANCE_ACTION
    ),
    AutomatedFlagId.SUSPICIOUS_CONVERSION_VALUES: _RuleCopy(
        HealthCheckSeverity.WARNING, _SUSPICIOUS_IMPLICATION, _SUSPICIOUS_ACTION
    ),
    AutomatedFlagId.CROSS_PLATFORM_ABSENCE: _RuleCopy(
        HealthCheckSeverity.INFO, _CROSS_PLATFORM_IMPLICATION, _CROSS_PLATFORM_ACTION
    ),
    AutomatedFlagId.CTR_OUTLIER: _RuleCopy(
        HealthCheckSeverity.WARNING, _CTR_OUTLIER_IMPLICATION, _CTR_OUTLIER_ACTION
    ),
}


@dataclass(frozen=True)
class _Candidate:
    flag_id: AutomatedFlagId
    platform: str | None
    finding: str
    metadata: Mapping[str, Any] = field(default_factory=dict)

    @property
    def severity(self) -> HealthCheckSeverity:
        return _RULE_COPY[self.flag_id].severity


def _render(candidate: _Candidate) -> dict[str, Any]:
    copy = _RULE_COPY[candidate.flag_id]
    return {
        "flag_id": candidate.flag_id.value,
        "severity": copy.severity.value,
        "platform": candidate.platform,
        "finding": candidate.finding,
        "implication": copy.implication,
        "action": copy.action,
        "metadata": dict(candidate.metadata),
    }


def _unavailable_entry(flag_id: AutomatedFlagId, message: str) -> dict[str, Any]:
    return {"flag_id": flag_id.value, "message": message}


def _fail_check(checks: tuple[CheckResult, ...], check_id: str) -> CheckResult | None:
    check = next((c for c in checks if c.check_id == check_id), None)
    return (
        check if check is not None and check.status == HealthCheckStatus.FAIL else None
    )


def _check_candidates(
    flag_id: AutomatedFlagId,
    google_check: CheckResult | None,
    meta_check: CheckResult | None,
) -> list[_Candidate]:
    candidates = []
    for platform, check in (("google", google_check), ("meta", meta_check)):
        if check is not None:
            candidates.append(
                _Candidate(
                    flag_id=flag_id,
                    platform=platform,
                    finding=check.message,
                    metadata=check.metadata,
                )
            )
    return candidates


def _zero_return_spend_candidates(
    google_checks: tuple[CheckResult, ...], meta_checks: tuple[CheckResult, ...]
) -> list[_Candidate]:
    return _check_candidates(
        AutomatedFlagId.ZERO_RETURN_SPEND,
        _fail_check(google_checks, GoogleAuditCheckId.ZERO_RETURN_SPEND.value),
        _fail_check(meta_checks, MetaAuditCheckId.ZERO_RETURN_SPEND.value),
    )


def _spend_concentration_candidates(
    google_checks: tuple[CheckResult, ...], meta_checks: tuple[CheckResult, ...]
) -> list[_Candidate]:
    return _check_candidates(
        AutomatedFlagId.SPEND_CONCENTRATION,
        _fail_check(google_checks, GoogleAuditCheckId.SPEND_CONCENTRATION.value),
        _fail_check(meta_checks, MetaAuditCheckId.SPEND_CONCENTRATION.value),
    )


def _brand_dominance(
    analysis_input: AnalysisInput,
) -> tuple[_Candidate | None, dict[str, Any] | None]:
    roas_section = build_roas_decomposition_section(analysis_input)
    brand = dict(roas_section.payload["brand_roas"])  # type: ignore[index]
    if brand.get("confidence") != "ok":
        return None, _unavailable_entry(
            AutomatedFlagId.BRAND_DOMINANCE, LOW_CONFIDENCE_MESSAGE
        )

    revenue_share = brand.get("revenue_share_of_google")
    share = Decimal(revenue_share) if revenue_share is not None else None
    if share is None or share <= _BRAND_DOMINANCE_THRESHOLD:
        return None, None

    finding = (
        f"Branded campaigns account for {share:.0%} of Google's attributed "
        "conversion value."
    )
    candidate = _Candidate(
        flag_id=AutomatedFlagId.BRAND_DOMINANCE,
        platform="google",
        finding=finding,
        metadata={"revenue_share_of_google": str(share)},
    )
    return candidate, None


def _suspicious_conversion_values_candidate(
    export: ParsedExport, platform: str
) -> _Candidate | None:
    if not export.data:
        return None

    qualifying = []
    for campaign in campaigns_of(export):
        spend = metric_total([campaign], MetricId.SPEND)
        conversion_value = metric_total([campaign], MetricId.CONVERSION_VALUE)
        roas = safe_ratio(conversion_value, spend)
        if roas is not None and roas > _SUSPICIOUS_ROAS_THRESHOLD:
            qualifying.append(campaign["name"])
    if not qualifying:
        return None

    names = sorted(qualifying)
    finding = (
        f"{len(names)} campaign(s) on {platform.title()} show ROAS above 20x: "
        f"{', '.join(names)}."
    )
    return _Candidate(
        flag_id=AutomatedFlagId.SUSPICIOUS_CONVERSION_VALUES,
        platform=platform,
        finding=finding,
        metadata={"campaigns": names},
    )


def _cross_platform_absence(
    google_export: ParsedExport, meta_export: ParsedExport
) -> tuple[_Candidate | None, dict[str, Any] | None]:
    if not google_export.data or not meta_export.data:
        return None, _unavailable_entry(
            AutomatedFlagId.CROSS_PLATFORM_ABSENCE, _REQUIRES_BOTH_EXPORTS
        )

    google_tokens = campaign_tokens(campaigns_of(google_export))
    meta_tokens = campaign_tokens(campaigns_of(meta_export))
    google_only = sorted(google_tokens - meta_tokens)
    meta_only = sorted(meta_tokens - google_tokens)
    if not google_only and not meta_only:
        return None, None

    finding = (
        f"{len(google_only)} campaign-name token(s) appear only on Google and "
        f"{len(meta_only)} only on Meta, with no match on the other platform "
        "(best-effort, based on campaign naming)."
    )
    candidate = _Candidate(
        flag_id=AutomatedFlagId.CROSS_PLATFORM_ABSENCE,
        platform=None,
        finding=finding,
        metadata={"google_only": google_only, "meta_only": meta_only},
    )
    return candidate, None


def _raw_metric(campaign: dict[str, Any], key: str) -> Decimal | None:
    raw = campaign["metrics"].get(key)
    return Decimal(raw) if raw is not None else None


def _campaign_ctr(campaign: dict[str, Any]) -> Decimal | None:
    impressions = _raw_metric(campaign, MetricId.IMPRESSIONS.value)
    clicks = _raw_metric(campaign, MetricId.CLICKS.value)
    if impressions is None or clicks is None or impressions == 0:
        return None
    return clicks / impressions * 100


def _ctr_outlier_candidate(export: ParsedExport, platform: str) -> _Candidate | None:
    if not export.data:
        return None

    campaigns = campaigns_of(export)
    total_spend = metric_total(campaigns, MetricId.SPEND)
    if total_spend <= 0:
        return None

    ctrs = [(c, ctr) for c in campaigns if (ctr := _campaign_ctr(c)) is not None]
    if not ctrs:
        return None

    median_ctr = statistics.median(ctr for _, ctr in ctrs)
    threshold = median_ctr * _CTR_OUTLIER_MEDIAN_SHARE
    qualifying = [
        c["name"]
        for c, ctr in ctrs
        if ctr < threshold
        and metric_total([c], MetricId.SPEND) / total_spend > _MEANINGFUL_SPEND_SHARE
    ]
    if not qualifying:
        return None

    names = sorted(qualifying)
    finding = (
        f"{len(names)} campaign(s) on {platform.title()} have CTR below 25% of the "
        f"platform median despite meaningful spend: {', '.join(names)}."
    )
    return _Candidate(
        flag_id=AutomatedFlagId.CTR_OUTLIER,
        platform=platform,
        finding=finding,
        metadata={"campaigns": names},
    )


def build_automated_flags_section(analysis_input: AnalysisInput) -> FindingsSection:
    google_export = export_for(analysis_input.exports, "google")
    meta_export = export_for(analysis_input.exports, "meta")
    google_checks = run_google_checks(google_export) if google_export.data else ()
    meta_checks = run_meta_checks(meta_export) if meta_export.data else ()

    candidates: list[_Candidate] = []
    unavailable: list[dict[str, Any]] = []

    candidates.extend(_zero_return_spend_candidates(google_checks, meta_checks))
    candidates.extend(_spend_concentration_candidates(google_checks, meta_checks))

    brand_candidate, brand_unavailable = _brand_dominance(analysis_input)
    if brand_candidate is not None:
        candidates.append(brand_candidate)
    if brand_unavailable is not None:
        unavailable.append(brand_unavailable)

    for platform, export in (("google", google_export), ("meta", meta_export)):
        suspicious = _suspicious_conversion_values_candidate(export, platform)
        if suspicious is not None:
            candidates.append(suspicious)

    cross_candidate, cross_unavailable = _cross_platform_absence(
        google_export, meta_export
    )
    if cross_candidate is not None:
        candidates.append(cross_candidate)
    if cross_unavailable is not None:
        unavailable.append(cross_unavailable)

    for platform, export in (("google", google_export), ("meta", meta_export)):
        ctr_outlier = _ctr_outlier_candidate(export, platform)
        if ctr_outlier is not None:
            candidates.append(ctr_outlier)

    ranked = sorted(candidates, key=lambda c: -_SEVERITY_RANK[c.severity])
    flags = [_render(c) for c in ranked[:_MAX_FLAGS]]

    return FindingsSection(
        title=SECTION_TITLE,
        status=SectionStatus.COMPUTED,
        payload={"flags": flags, "unavailable": unavailable},
    )
