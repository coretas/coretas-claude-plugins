"""Section 2 -- claimed against actual: the report's first cross-platform insight."""

from analysis_core.aggregation import campaigns_of, export_for, metric_total, safe_ratio
from analysis_core.models import AnalysisInput, FindingsSection, SectionStatus
from app.core.metrics import MetricId

SECTION_TITLE = "Claimed vs. Actual"

_GOOGLE = "google"
_META = "meta"

_MISSING_EXPORTS_REASON = "requires both exports"
_STORE_REVENUE_INVITATION = (
    "Add your store revenue to see the measurement gap between what Google and Meta "
    "claim and what your store actually recorded."
)

# gap >= 0: platforms claim more than the store recorded.
_STANDARD_CAUSES: tuple[str, ...] = (
    "Revenue definitions: the two platforms count different underlying events before "
    "any overlap is considered (see the revenue-definitions footnote in Section 4).",
    "Platform overlap: the same purchase can be counted by more than one platform.",
    "View-through attribution: a platform can credit itself for a purchase the "
    "customer never clicked into.",
    "Refunds: a platform's claimed figure may not reflect a refund the store already "
    "recorded.",
    "Duplicate events: the same purchase firing more than once on a platform's side.",
    "Date assignment: a platform can assign a conversion to a different day than the "
    "store recorded the sale.",
)

# gap < 0: the store recorded more than the platforms claim.
_NEGATIVE_GAP_CAUSES: tuple[str, ...] = (
    "Undertracking: a platform's pixel or conversion API can miss purchases it "
    "should have counted.",
    "Substantial revenue from unpaid channels: direct traffic, organic search, email "
    "or other unpaid sources the platforms were never going to claim.",
)


def _skip(reason: str) -> FindingsSection:
    return FindingsSection(
        title=SECTION_TITLE, status=SectionStatus.SKIPPED, skip_reason=reason
    )


def build_claimed_vs_actual_section(analysis_input: AnalysisInput) -> FindingsSection:
    google_export = export_for(analysis_input.exports, _GOOGLE)
    meta_export = export_for(analysis_input.exports, _META)
    if not google_export.data or not meta_export.data:
        return _skip(_MISSING_EXPORTS_REASON)

    store_revenue = analysis_input.context.store_revenue
    if store_revenue is None:
        return _skip(_STORE_REVENUE_INVITATION)

    combined_claim = metric_total(
        campaigns_of(google_export), MetricId.CONVERSION_VALUE
    ) + metric_total(campaigns_of(meta_export), MetricId.CONVERSION_VALUE)
    gap = combined_claim - store_revenue
    gap_pct = safe_ratio(gap, store_revenue)
    causes = _STANDARD_CAUSES if gap >= 0 else _NEGATIVE_GAP_CAUSES

    return FindingsSection(
        title=SECTION_TITLE,
        status=SectionStatus.COMPUTED,
        payload={
            "combined_claim": str(combined_claim),
            "store_revenue": str(store_revenue),
            "gap": str(gap),
            "gap_pct": str(gap_pct) if gap_pct is not None else None,
            "label": "measurement gap",
            "candidate_causes": causes,
        },
    )
