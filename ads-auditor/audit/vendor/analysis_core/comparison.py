"""Cross-platform comparison over both exports -- what neither platform's own checks can see."""

from typing import Any

from analysis_core.aggregation import (
    campaign_tokens,
    campaigns_of,
    export_for,
    metric_total,
    safe_ratio,
)
from analysis_core.models import (
    AnalysisInput,
    FindingsSection,
    ParsedExport,
    SectionStatus,
)
from app.core.metrics import MetricId

_GOOGLE = "google"
_META = "meta"

_REQUIRES_BOTH_EXPORTS = "requires both exports"


def _platform_totals(campaigns: list[dict[str, Any]]) -> dict[str, str | None]:
    spend = metric_total(campaigns, MetricId.SPEND)
    conversions = metric_total(campaigns, MetricId.CONVERSIONS)
    conversion_value = metric_total(campaigns, MetricId.CONVERSION_VALUE)
    roas = safe_ratio(conversion_value, spend)
    return {
        MetricId.SPEND.value: str(spend),
        MetricId.CONVERSIONS.value: str(conversions),
        MetricId.CONVERSION_VALUE.value: str(conversion_value),
        MetricId.ROAS.value: str(roas) if roas is not None else None,
    }


def _date_window(export: ParsedExport) -> dict[str, str] | None:
    window = export.data.get("date_window")
    return dict(window) if window is not None else None


def _counting_method_caveat(google: ParsedExport, meta: ParsedExport) -> str:
    meta_label = meta.data.get("results_column_label")
    meta_basis = (
        f'the "{meta_label}" column its export labelled as Results'
        if meta_label
        else "whatever column its export labelled as Results"
    )
    return (
        "Counted on each platform's own basis, not a shared one: Google totals whatever "
        f"conversion actions the account tracks; Meta totals {meta_basis}."
    )


# Crude by design (the ticket's own framing): a token found in one platform's campaign names
# and not the other's is "best-effort" evidence of a theme run on only one side, not a claim
# about the underlying campaign structure.
def _theme_overlap(
    google_campaigns: list[dict[str, Any]], meta_campaigns: list[dict[str, Any]]
) -> dict[str, list[str]]:
    google_tokens = campaign_tokens(google_campaigns)
    meta_tokens = campaign_tokens(meta_campaigns)
    return {
        "shared": sorted(google_tokens & meta_tokens),
        "google_only": sorted(google_tokens - meta_tokens),
        "meta_only": sorted(meta_tokens - google_tokens),
    }


def run_cross_platform_comparison(analysis_input: AnalysisInput) -> FindingsSection:
    title = "Cross-platform comparison"
    google_export = export_for(analysis_input.exports, _GOOGLE)
    meta_export = export_for(analysis_input.exports, _META)

    if not google_export.data or not meta_export.data:
        return FindingsSection(
            title=title,
            status=SectionStatus.SKIPPED,
            skip_reason=_REQUIRES_BOTH_EXPORTS,
        )

    google_campaigns = campaigns_of(google_export)
    meta_campaigns = campaigns_of(meta_export)

    combined_spend = metric_total(google_campaigns, MetricId.SPEND) + metric_total(
        meta_campaigns, MetricId.SPEND
    )
    combined_conversions = metric_total(
        google_campaigns, MetricId.CONVERSIONS
    ) + metric_total(meta_campaigns, MetricId.CONVERSIONS)
    combined_conversion_value = metric_total(
        google_campaigns, MetricId.CONVERSION_VALUE
    ) + metric_total(meta_campaigns, MetricId.CONVERSION_VALUE)

    google_spend = metric_total(google_campaigns, MetricId.SPEND)
    meta_spend = metric_total(meta_campaigns, MetricId.SPEND)
    google_conversions = metric_total(google_campaigns, MetricId.CONVERSIONS)
    meta_conversions = metric_total(meta_campaigns, MetricId.CONVERSIONS)

    google_spend_share = safe_ratio(google_spend, combined_spend)
    meta_spend_share = safe_ratio(meta_spend, combined_spend)
    google_conversion_share = safe_ratio(google_conversions, combined_conversions)
    meta_conversion_share = safe_ratio(meta_conversions, combined_conversions)

    return FindingsSection(
        title=title,
        status=SectionStatus.COMPUTED,
        payload={
            "counting_method_caveat": _counting_method_caveat(
                google_export, meta_export
            ),
            "date_windows": {
                _GOOGLE: _date_window(google_export),
                _META: _date_window(meta_export),
            },
            "combined": {
                MetricId.SPEND.value: str(combined_spend),
                MetricId.CONVERSIONS.value: str(combined_conversions),
                MetricId.CONVERSION_VALUE.value: str(combined_conversion_value),
            },
            "platform_totals": {
                _GOOGLE: _platform_totals(google_campaigns),
                _META: _platform_totals(meta_campaigns),
            },
            "shares": {
                _GOOGLE: {
                    "spend_share": str(google_spend_share)
                    if google_spend_share is not None
                    else None,
                    "conversion_share": str(google_conversion_share)
                    if google_conversion_share is not None
                    else None,
                },
                _META: {
                    "spend_share": str(meta_spend_share)
                    if meta_spend_share is not None
                    else None,
                    "conversion_share": str(meta_conversion_share)
                    if meta_conversion_share is not None
                    else None,
                },
            },
            "theme_overlap": _theme_overlap(google_campaigns, meta_campaigns),
        },
    )
