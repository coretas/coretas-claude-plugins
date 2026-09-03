"""Google export checks, scoped to what an Ads UI CSV/XLSX download can actually support."""

from collections import defaultdict
from collections.abc import Mapping
from datetime import date
from decimal import Decimal, InvalidOperation
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

PMAX_CAMPAIGN_TYPE = "Performance Max"
SEARCH_CAMPAIGN_TYPE = "Search"

# auto_tagging, test_account and account_status are read from the Google Ads account settings
# screen -- never present in a campaign-level export. Named here rather than silently having no
# check, so "not covered" is a stated fact a later report section can point at (Section 1's
# limits copy), not an implied gap.
NOT_EXPORT_DERIVABLE: frozenset[HealthCheckId] = frozenset(
    {
        HealthCheckId.GOOGLE_AUTO_TAGGING,
        HealthCheckId.GOOGLE_TEST_ACCOUNT,
        HealthCheckId.GOOGLE_ACCOUNT_STATUS,
    }
)


class GoogleAuditCheckId(str, Enum):
    """Ids with no live-connection equivalent, or finer-grained than the live registry's.

    Never add these to HealthCheckId: its registry test pins every member to a check that emits
    it, and no live check ever will for an export-only or sub-signal finding.
    """

    CAMPAIGN_TYPE_OBJECTIVE_MISMATCH = "google.campaign_type_objective_mismatch"
    BID_STRATEGY_OBJECTIVE_MISMATCH = "google.bid_strategy_objective_mismatch"
    BUDGET_CONSTRAINED = "google.budget_constrained"
    SPEND_CONCENTRATION = "google.spend_concentration"
    ZERO_RETURN_SPEND = "google.zero_return_spend"
    PMAX_SEARCH_OVERLAP = "google.pmax_search_overlap"
    PAUSED_BUT_FUNDED = "google.paused_but_funded"
    ROW_READABILITY = "google.row_readability"
    CONVERSION_TRACKING_NO_DATA_IN_WINDOW = (
        f"{HealthCheckId.GOOGLE_CONVERSION_TRACKING.value}:no_data_in_window"
    )
    CONVERSION_TRACKING_MISCONFIGURED = (
        f"{HealthCheckId.GOOGLE_CONVERSION_TRACKING.value}:misconfigured"
    )


# Known-incompatible (campaign type, objective) pairs -- a denylist, not an allowlist: an
# objective this table has never heard of is never flagged, only one it knows is wrong for that
# type. Guessing at compatibility for an unrecognized objective would risk a wrong finding.
_INCOMPATIBLE_CAMPAIGN_TYPE_OBJECTIVES: frozenset[tuple[str, str]] = frozenset(
    {
        ("performance max", "awareness and consideration"),
        ("performance max", "brand awareness and reach"),
        ("display", "app promotion"),
        ("search", "app promotion"),
        ("video", "app promotion"),
        ("shopping", "app promotion"),
    }
)

# Bid strategies that never optimize toward a conversion; paired with a conversion-oriented
# objective, the account is buying clicks or impressions while told to buy sales or leads.
_NON_CONVERSION_BID_STRATEGIES = frozenset(
    {
        "maximize clicks",
        "target impression share",
        "target search page location",
        "viewable cpm (vcpm)",
        "vcpm",
    }
)
_CONVERSION_OBJECTIVES = frozenset({"sales", "leads"})

# "Sustained... at or near budget": average daily spend at or above this share of the daily
# budget. Stated explicitly in the finding message, not just applied silently.
_BUDGET_CONSTRAINED_THRESHOLD = Decimal("0.9")

# Matches CRM-1592's Meta thresholds so Section 5 ranks both platforms' structural-waste
# findings on the same scale.
_SPEND_CONCENTRATION_THRESHOLD = Decimal("0.50")
_ZERO_RETURN_SPEND_THRESHOLD = Decimal("0.02")

_NO_DATA_CHECK_ID = GoogleAuditCheckId.CONVERSION_TRACKING_NO_DATA_IN_WINDOW.value
_MISCONFIGURED_CHECK_ID = GoogleAuditCheckId.CONVERSION_TRACKING_MISCONFIGURED.value

_NOT_SUPPLIED_REASON = "no Google export was supplied"
_UNSEGMENTED_REASON = "the Google export was not segmented by conversion action"
_NO_ROWS_REASON = "the Google export had no usable campaign rows"
_NO_CONVERSIONS_COLUMN_REASON = "the Google export is missing the Conversions column"

# Conversion Action-level settings in the Google Ads UI; no campaign-level export column
# carries either, so these can never be checked from an export -- named, not guessed at, for
# a later Section 1's limits copy to point at.
CONVERSION_TRACKING_LIMITS: tuple[str, ...] = (
    "attribution window per conversion action is not visible in any campaign-level export",
    "primary/secondary status per conversion action is not visible in any campaign-level "
    "export",
)


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
    check_id = HealthCheckId.GOOGLE_CURRENCY_ALIGNMENT.value
    currency = export.data.get("currency")
    if currency is None:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.SKIP,
            severity=HealthCheckSeverity.INFO,
            message="Google export not supplied.",
        )
    return CheckResult(
        check_id=check_id,
        status=HealthCheckStatus.PASS,
        severity=HealthCheckSeverity.INFO,
        message=f"Google export currency is {currency}.",
        metadata={"currency": currency},
    )


def _check_campaign_type_objective(export: ParsedExport) -> CheckResult:
    check_id = GoogleAuditCheckId.CAMPAIGN_TYPE_OBJECTIVE_MISMATCH.value
    campaigns = _campaigns(export)
    if not any(campaign.get("objective") for campaign in campaigns):
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.SKIP,
            severity=HealthCheckSeverity.INFO,
            message="Campaign objective not present in this Google export.",
        )

    mismatched: list[str] = []
    for campaign in campaigns:
        objective = campaign.get("objective", "").strip().lower()
        campaign_type = campaign.get("type", "").strip().lower()
        if not objective:
            continue
        if (campaign_type, objective) in _INCOMPATIBLE_CAMPAIGN_TYPE_OBJECTIVES:
            mismatched.append(campaign["name"])

    if mismatched:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.FAIL,
            severity=HealthCheckSeverity.WARNING,
            message=(
                "Campaign type does not support its stated objective: "
                + ", ".join(sorted(mismatched))
            ),
            metadata={"campaigns": sorted(mismatched)},
        )
    return CheckResult(
        check_id=check_id,
        status=HealthCheckStatus.PASS,
        severity=HealthCheckSeverity.WARNING,
        message="Campaign type and stated objective are consistent.",
    )


def _check_bid_strategy_objective(export: ParsedExport) -> CheckResult:
    check_id = GoogleAuditCheckId.BID_STRATEGY_OBJECTIVE_MISMATCH.value
    campaigns = _campaigns(export)
    has_bid_strategy = any(campaign.get("bid_strategy") for campaign in campaigns)
    has_objective = any(campaign.get("objective") for campaign in campaigns)
    if not has_bid_strategy or not has_objective:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.SKIP,
            severity=HealthCheckSeverity.INFO,
            message="Bid strategy type or campaign objective not present in this Google export.",
        )

    mismatched: list[str] = []
    for campaign in campaigns:
        objective = campaign.get("objective", "").strip().lower()
        bid_strategy = campaign.get("bid_strategy", "").strip().lower()
        if not objective or not bid_strategy:
            continue
        if (
            objective in _CONVERSION_OBJECTIVES
            and bid_strategy in _NON_CONVERSION_BID_STRATEGIES
        ):
            mismatched.append(campaign["name"])

    if mismatched:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.FAIL,
            severity=HealthCheckSeverity.WARNING,
            message=(
                "Bid strategy does not optimize for the stated conversion objective: "
                + ", ".join(sorted(mismatched))
            ),
            metadata={"campaigns": sorted(mismatched)},
        )
    return CheckResult(
        check_id=check_id,
        status=HealthCheckStatus.PASS,
        severity=HealthCheckSeverity.WARNING,
        message="Bid strategy and stated objective are consistent.",
    )


def _check_budget_constrained(export: ParsedExport) -> CheckResult:
    check_id = GoogleAuditCheckId.BUDGET_CONSTRAINED.value
    campaigns = _campaigns(export)
    date_window = export.data.get("date_window")
    if not any(campaign.get("daily_budget") for campaign in campaigns):
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.SKIP,
            severity=HealthCheckSeverity.INFO,
            message="Budget column not present in this Google export.",
        )
    if date_window is None:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.SKIP,
            severity=HealthCheckSeverity.INFO,
            message="No known date window to compute average daily spend.",
        )

    window_days = (
        date.fromisoformat(date_window["end"])
        - date.fromisoformat(date_window["start"])
    ).days + 1

    constrained: list[str] = []
    for campaign in campaigns:
        raw_budget = campaign.get("daily_budget")
        raw_spend = campaign.get("metrics", {}).get("spend")
        if raw_budget is None or raw_spend is None:
            continue
        daily_budget = Decimal(raw_budget)
        if daily_budget <= 0:
            continue
        average_daily_spend = Decimal(raw_spend) / Decimal(window_days)
        if average_daily_spend / daily_budget >= _BUDGET_CONSTRAINED_THRESHOLD:
            constrained.append(campaign["name"])

    if constrained:
        threshold_pct = int(_BUDGET_CONSTRAINED_THRESHOLD * 100)
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.FAIL,
            severity=HealthCheckSeverity.WARNING,
            message=(
                f"{len(constrained)} campaign(s) at or above {threshold_pct}% of the daily "
                "budget, sustained over the export window."
            ),
            metadata={"campaigns": sorted(constrained)},
        )
    return CheckResult(
        check_id=check_id,
        status=HealthCheckStatus.PASS,
        severity=HealthCheckSeverity.WARNING,
        message="No campaign is sustained at or near its daily budget.",
    )


def _check_spend_concentration(
    export: ParsedExport, total_spend: Decimal
) -> CheckResult:
    check_id = GoogleAuditCheckId.SPEND_CONCENTRATION.value
    campaigns = _campaigns(export)
    if not campaigns or total_spend <= 0:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.SKIP,
            severity=HealthCheckSeverity.INFO,
            message="No Google campaign spend to evaluate.",
        )

    top = max(campaigns, key=lambda c: _metric(c, MetricId.SPEND) or Decimal(0))
    share = (_metric(top, MetricId.SPEND) or Decimal(0)) / total_spend

    if share > _SPEND_CONCENTRATION_THRESHOLD:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.FAIL,
            severity=HealthCheckSeverity.WARNING,
            message=(
                f"'{top['name']}' accounts for {share:.0%} of Google spend, above the "
                f"{_SPEND_CONCENTRATION_THRESHOLD:.0%} concentration threshold."
            ),
            metadata={"campaign": top["name"], "share": str(share)},
        )
    return CheckResult(
        check_id=check_id,
        status=HealthCheckStatus.PASS,
        severity=HealthCheckSeverity.WARNING,
        message=(
            f"No campaign exceeds the {_SPEND_CONCENTRATION_THRESHOLD:.0%} spend "
            "concentration threshold."
        ),
    )


def _check_zero_return_spend(export: ParsedExport, total_spend: Decimal) -> CheckResult:
    check_id = GoogleAuditCheckId.ZERO_RETURN_SPEND.value
    campaigns = _campaigns(export)
    if not campaigns or total_spend <= 0:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.SKIP,
            severity=HealthCheckSeverity.INFO,
            message="No Google campaign spend to evaluate.",
        )

    qualifying = [
        c["name"]
        for c in campaigns
        if (_metric(c, MetricId.SPEND) or Decimal(0)) / total_spend
        > _ZERO_RETURN_SPEND_THRESHOLD
        and (_metric(c, MetricId.CONVERSIONS) or Decimal(0)) == 0
    ]

    if qualifying:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.FAIL,
            severity=HealthCheckSeverity.WARNING,
            message=(
                f"{len(qualifying)} campaign(s) spend above "
                f"{_ZERO_RETURN_SPEND_THRESHOLD:.0%} of Google spend with zero conversions."
            ),
            metadata={"campaigns": qualifying},
        )
    return CheckResult(
        check_id=check_id,
        status=HealthCheckStatus.PASS,
        severity=HealthCheckSeverity.WARNING,
        message=(
            f"No campaign spends above {_ZERO_RETURN_SPEND_THRESHOLD:.0%} of Google "
            "spend without a conversion."
        ),
    )


def _check_pmax_search_overlap(export: ParsedExport) -> CheckResult:
    check_id = GoogleAuditCheckId.PMAX_SEARCH_OVERLAP.value
    campaigns = _campaigns(export)
    pmax_present = any(c["type"] == PMAX_CAMPAIGN_TYPE for c in campaigns)
    search_present = any(c["type"] == SEARCH_CAMPAIGN_TYPE for c in campaigns)
    if not (pmax_present and search_present):
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.SKIP,
            severity=HealthCheckSeverity.INFO,
            message="No Performance Max and Search campaigns both present to compare.",
        )

    if export.data.get("has_keyword_data", False):
        message = (
            "Performance Max never exposes its search terms in an export, so "
            "keyword-level overlap with Search campaigns can't be verified."
        )
    else:
        message = (
            "Performance Max never exposes its search terms in an export, and no "
            "keyword/search-term data was supplied for Search campaigns either, so "
            "keyword-level overlap between them can't be verified at all."
        )
    return CheckResult(
        check_id=check_id,
        status=HealthCheckStatus.SKIP,
        severity=HealthCheckSeverity.INFO,
        message=message,
    )


def _check_paused_but_funded(export: ParsedExport) -> CheckResult:
    return CheckResult(
        check_id=GoogleAuditCheckId.PAUSED_BUT_FUNDED.value,
        status=HealthCheckStatus.SKIP,
        severity=HealthCheckSeverity.INFO,
        message=(
            "This export carries no campaign-status field, so paused-but-funded "
            "campaigns can't be detected."
        ),
    )


def _check_row_readability(export: ParsedExport) -> CheckResult:
    check_id = GoogleAuditCheckId.ROW_READABILITY.value
    if "campaigns" not in export.data:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.SKIP,
            severity=HealthCheckSeverity.INFO,
            message="No Google export supplied.",
        )

    rejected = int(export.data.get("rejected_row_count", 0))
    if rejected <= 0:
        return CheckResult(
            check_id=check_id,
            status=HealthCheckStatus.PASS,
            severity=HealthCheckSeverity.WARNING,
            message="Every Google campaign row in this export was read.",
        )
    return CheckResult(
        check_id=check_id,
        status=HealthCheckStatus.FAIL,
        severity=HealthCheckSeverity.WARNING,
        message=(
            f"{rejected} Google campaign row(s) in this export could not be read and "
            "were excluded from every check here."
        ),
        metadata={"rejected_row_count": rejected},
    )


def _conversion_tracking_skip_reason(export: ParsedExport) -> str | None:
    if not export.data:
        return _NOT_SUPPLIED_REASON
    if not export.data.get("has_conversion_action_breakdown"):
        return _UNSEGMENTED_REASON
    campaigns = export.data["campaigns"]
    if not campaigns:
        return _NO_ROWS_REASON
    # Conversions is normally a required column, but validate_submission never inspects
    # parsing's BLOCKER missing-column notices -- a submission missing it can still reach
    # READY, and every surviving row then lacks the metric outright (parsing.py only drops
    # a row for an unparseable *present* cell, never for a column absent from the header).
    if not any(MetricId.CONVERSIONS.value in c["metrics"] for c in campaigns):
        return _NO_CONVERSIONS_COLUMN_REASON
    return None


def _conversion_tracking_skip_result(check_id: str, reason: str) -> CheckResult:
    return CheckResult(
        check_id=check_id,
        status=HealthCheckStatus.SKIP,
        severity=HealthCheckSeverity.INFO,
        message=reason,
    )


def _conversions(campaign: Mapping[str, Any]) -> Decimal:
    raw = campaign["metrics"].get(MetricId.CONVERSIONS.value)
    if raw is None:
        return Decimal(0)
    try:
        return Decimal(raw)
    except InvalidOperation:
        return Decimal(0)


def _action_totals(campaigns: list[Mapping[str, Any]]) -> dict[str, Decimal]:
    totals: dict[str, Decimal] = defaultdict(Decimal)
    for campaign in campaigns:
        action = campaign.get("conversion_action")
        if action is None:
            continue
        totals[action] += _conversions(campaign)
    return totals


def _no_data_in_window_result(campaigns: list[Mapping[str, Any]]) -> CheckResult:
    zero_actions = sorted(
        action for action, total in _action_totals(campaigns).items() if total == 0
    )
    if zero_actions:
        return CheckResult(
            check_id=_NO_DATA_CHECK_ID,
            status=HealthCheckStatus.FAIL,
            severity=HealthCheckSeverity.WARNING,
            message=(
                f"{len(zero_actions)} conversion action(s) recorded no conversions in the "
                "export window."
            ),
            metadata={"conversion_actions": zero_actions},
        )
    return CheckResult(
        check_id=_NO_DATA_CHECK_ID,
        status=HealthCheckStatus.PASS,
        severity=HealthCheckSeverity.WARNING,
        message="Every conversion action recorded at least one conversion in the export window.",
    )


def _normalized(name: str) -> str:
    return " ".join(name.split()).lower()


def _duplicate_groups(campaigns: list[Mapping[str, Any]]) -> list[list[str]]:
    by_normalized: dict[str, set[str]] = defaultdict(set)
    for campaign in campaigns:
        action = campaign.get("conversion_action")
        if action is not None:
            by_normalized[_normalized(action)].add(action)

    return sorted(sorted(names) for names in by_normalized.values() if len(names) > 1)


def _misconfigured_result(campaigns: list[Mapping[str, Any]]) -> CheckResult:
    groups = _duplicate_groups(campaigns)
    if groups:
        return CheckResult(
            check_id=_MISCONFIGURED_CHECK_ID,
            status=HealthCheckStatus.FAIL,
            severity=HealthCheckSeverity.WARNING,
            message=(
                f"{len(groups)} group(s) of conversion action names look like duplicates or "
                "overlap."
            ),
            metadata={"conversion_action_groups": groups},
        )
    return CheckResult(
        check_id=_MISCONFIGURED_CHECK_ID,
        status=HealthCheckStatus.PASS,
        severity=HealthCheckSeverity.WARNING,
        message="No conversion action names look like duplicates or overlap.",
    )


def _conversion_tracking_results(
    export: ParsedExport,
) -> tuple[CheckResult, CheckResult]:
    skip_reason = _conversion_tracking_skip_reason(export)
    if skip_reason is not None:
        return (
            _conversion_tracking_skip_result(_NO_DATA_CHECK_ID, skip_reason),
            _conversion_tracking_skip_result(_MISCONFIGURED_CHECK_ID, skip_reason),
        )

    campaigns: list[Mapping[str, Any]] = export.data["campaigns"]
    return (
        _no_data_in_window_result(campaigns),
        _misconfigured_result(campaigns),
    )


def run_google_checks(export: ParsedExport) -> tuple[CheckResult, ...]:
    campaigns = _campaigns(export)
    total_spend = _total_spend(campaigns)
    return (
        _check_currency_alignment(export),
        _check_campaign_type_objective(export),
        _check_bid_strategy_objective(export),
        _check_budget_constrained(export),
        _check_row_readability(export),
        _check_spend_concentration(export, total_spend),
        _check_zero_return_spend(export, total_spend),
        _check_pmax_search_overlap(export),
        _check_paused_but_funded(export),
        *_conversion_tracking_results(export),
    )
