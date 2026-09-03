"""Meta export checks, scoped to what an Ads Manager CSV/XLSX download can actually support."""

from decimal import Decimal
from enum import Enum
from typing import Any

from analysis_core.checks.models import CheckResult
from analysis_core.models import ParsedExport
from app.core.enums.health_check import (
    HealthCheckId,
    HealthCheckSeverity,
    HealthCheckStatus,
)
from app.core.metrics import MetricId

# Business verification, the ad account's payment method, and Pixel activity are read from
# Meta's Business Manager / Ads API -- never present in an Ads Manager export. Named here rather
# than silently having no check, so "not covered" is a stated fact a later report section can
# point at (Section 1's limits copy), not an implied gap.
NOT_EXPORT_DERIVABLE: frozenset[HealthCheckId] = frozenset(
    {
        HealthCheckId.META_BUSINESS_VERIFICATION,
        HealthCheckId.META_PAYMENT_METHOD,
        HealthCheckId.META_PIXEL_ACTIVITY,
    }
)


class MetaAuditCheckId(str, Enum):
    """Ids with no live-connection equivalent.

    Never add these to HealthCheckId: its registry test pins every member to a check that emits
    it, and no live check ever will for an export-only finding.
    """

    SPEND_CONCENTRATION = "meta.spend_concentration"
    ZERO_RETURN_SPEND = "meta.zero_return_spend"
    FREQUENCY_CEILING = "meta.frequency_ceiling"


# Matches CRM-1591's Google thresholds so Section 5 ranks both platforms' structural-waste
# findings on the same scale.
_SPEND_CONCENTRATION_THRESHOLD = Decimal("0.50")
_ZERO_RETURN_SPEND_THRESHOLD = Decimal("0.02")
# A commonly used Meta ad-fatigue benchmark. Meta's own pre-aggregated per-window figure, not a
# rate we compute ourselves -- see app.core.metrics.NO_RANGE_BASIS_METRICS for why we couldn't.
_FREQUENCY_CEILING = Decimal("4.0")


def _campaigns(export: ParsedExport) -> list[dict[str, Any]]:
    return list(export.data.get("campaigns", []))


def _metric(campaign: dict[str, Any], metric_id: MetricId) -> Decimal | None:
    raw = campaign["metrics"].get(metric_id.value)
    return Decimal(raw) if raw is not None else None


def _total_spend(campaigns: list[dict[str, Any]]) -> Decimal:
    return sum(
        (_metric(c, MetricId.SPEND) or Decimal(0) for c in campaigns), Decimal(0)
    )


def _check_currency_alignment(export: ParsedExport) -> CheckResult:
    check_id = HealthCheckId.META_CURRENCY_ALIGNMENT.value
    currency = export.data.get("currency")
    if currency is None:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.SKIP,
            severity=HealthCheckSeverity.INFO,
            message="Meta export not supplied.",
        )
    return CheckResult(
        check_id=check_id,
        status=HealthCheckStatus.PASS,
        severity=HealthCheckSeverity.INFO,
        message=f"Meta export currency is {currency}.",
        metadata={"currency": currency},
    )


def _check_spend_concentration(
    export: ParsedExport, total_spend: Decimal
) -> CheckResult:
    check_id = MetaAuditCheckId.SPEND_CONCENTRATION.value
    campaigns = _campaigns(export)
    if not campaigns or total_spend <= 0:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.SKIP,
            severity=HealthCheckSeverity.INFO,
            message="No Meta campaign spend to evaluate.",
        )

    top = max(campaigns, key=lambda c: _metric(c, MetricId.SPEND) or Decimal(0))
    share = (_metric(top, MetricId.SPEND) or Decimal(0)) / total_spend

    if share >= _SPEND_CONCENTRATION_THRESHOLD:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.FAIL,
            severity=HealthCheckSeverity.WARNING,
            message=(
                f"'{top['name']}' accounts for {share:.0%} of Meta spend, at or above the "
                f"{_SPEND_CONCENTRATION_THRESHOLD:.0%} concentration threshold."
            ),
            metadata={"campaign": top["name"], "share": str(share)},
        )
    return CheckResult(
        check_id=check_id,
        status=HealthCheckStatus.PASS,
        severity=HealthCheckSeverity.WARNING,
        message=(
            f"No campaign exceeds the {_SPEND_CONCENTRATION_THRESHOLD:.0%} spend concentration "
            "threshold."
        ),
    )


def _check_zero_return_spend(export: ParsedExport, total_spend: Decimal) -> CheckResult:
    check_id = MetaAuditCheckId.ZERO_RETURN_SPEND.value
    campaigns = _campaigns(export)
    if not campaigns or total_spend <= 0:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.SKIP,
            severity=HealthCheckSeverity.INFO,
            message="No Meta campaign spend to evaluate.",
        )

    qualifying = [
        c["name"]
        for c in campaigns
        if (_metric(c, MetricId.SPEND) or Decimal(0)) / total_spend
        >= _ZERO_RETURN_SPEND_THRESHOLD
        and (_metric(c, MetricId.CONVERSIONS) or Decimal(0)) == 0
    ]

    if qualifying:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.FAIL,
            severity=HealthCheckSeverity.WARNING,
            message=(
                f"{len(qualifying)} campaign(s) spend at or above "
                f"{_ZERO_RETURN_SPEND_THRESHOLD:.0%} of Meta spend with zero conversions."
            ),
            metadata={"campaigns": qualifying},
        )
    return CheckResult(
        check_id=check_id,
        status=HealthCheckStatus.PASS,
        severity=HealthCheckSeverity.WARNING,
        message="No campaign spends without return above the threshold.",
    )


def _check_frequency_ceiling(export: ParsedExport) -> CheckResult:
    check_id = MetaAuditCheckId.FREQUENCY_CEILING.value
    with_frequency = [
        c for c in _campaigns(export) if MetricId.FREQUENCY.value in c["metrics"]
    ]

    if not with_frequency:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.SKIP,
            severity=HealthCheckSeverity.INFO,
            message="Frequency column not present in this Meta export.",
        )

    qualifying = [
        c["name"]
        for c in with_frequency
        if (_metric(c, MetricId.FREQUENCY) or Decimal(0)) >= _FREQUENCY_CEILING
    ]
    if qualifying:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.FAIL,
            severity=HealthCheckSeverity.WARNING,
            message=f"{len(qualifying)} campaign(s) at or above a frequency of {_FREQUENCY_CEILING}.",
            metadata={"campaigns": qualifying},
        )
    return CheckResult(
        check_id=check_id,
        status=HealthCheckStatus.PASS,
        severity=HealthCheckSeverity.WARNING,
        message=f"No campaign reaches a frequency of {_FREQUENCY_CEILING}.",
    )


def run_meta_checks(export: ParsedExport) -> tuple[CheckResult, ...]:
    total_spend = _total_spend(_campaigns(export))
    return (
        _check_currency_alignment(export),
        _check_spend_concentration(export, total_spend),
        _check_zero_return_spend(export, total_spend),
        _check_frequency_ceiling(export),
    )
