"""Section 4 -- the KPI reference table and top campaigns, per platform and combined."""

from decimal import Decimal
from typing import Any

from analysis_core.models import (
    AnalysisInput,
    FindingsSection,
    ParsedExport,
    SectionStatus,
)
from app.core.metrics import MetricId, compute_derived_metrics

SECTION_TITLE = "KPI Table and Top Campaigns"

_TOP_CAMPAIGN_COUNT = 5

_ROW_METRIC_IDS: tuple[MetricId, ...] = (
    MetricId.SPEND,
    MetricId.IMPRESSIONS,
    MetricId.CLICKS,
    MetricId.CTR,
    MetricId.CPC,
    MetricId.CONVERSIONS,
    MetricId.CONVERSION_VALUE,
    MetricId.ROAS,
    MetricId.CPA,
)

_NONE_ROW: dict[str, str | None] = dict.fromkeys(m.value for m in _ROW_METRIC_IDS)

_GOOGLE_CONVERSIONS_NOTE = 'Google conversions: the "Conversions" column.'
_DERIVED_METRICS_NOTE = (
    "CTR, average CPC, ROAS and cost per conversion are computed here, never read from "
    "an export column."
)


def _campaigns(export: ParsedExport) -> list[dict[str, Any]]:
    return list(export.data.get("campaigns", []))


def _metric(campaign: dict[str, Any], metric_id: MetricId) -> Decimal:
    raw = campaign["metrics"].get(metric_id.value)
    return Decimal(raw) if raw is not None else Decimal(0)


def _total(campaigns: list[dict[str, Any]], metric_id: MetricId) -> Decimal | None:
    """Sum a metric across campaigns; `None` when none of them ever carried the column."""
    values = [
        Decimal(raw)
        for c in campaigns
        if (raw := c["metrics"].get(metric_id.value)) is not None
    ]
    if campaigns and not values:
        return None
    return sum(values, Decimal(0))


def _int_total(campaigns: list[dict[str, Any]], metric_id: MetricId) -> int | None:
    total = _total(campaigns, metric_id)
    return int(total) if total is not None else None


def _export_for(
    exports: tuple[ParsedExport, ParsedExport], platform: str
) -> ParsedExport:
    for export in exports:
        if export.platform == platform:
            return export
    raise ValueError(f"no {platform} export in exports")


def _optional(value: Decimal | int | None) -> str | None:
    return str(value) if value is not None else None


def _dependent(value: Decimal | None, *deps: Any) -> Decimal | None:
    """`value` unless one of its own inputs was itself absent (never a computed zero)."""
    return value if all(dep is not None for dep in deps) else None


def _kpi_row(campaigns: list[dict[str, Any]]) -> dict[str, str | None]:
    spend = _total(campaigns, MetricId.SPEND)
    impressions = _int_total(campaigns, MetricId.IMPRESSIONS)
    clicks = _int_total(campaigns, MetricId.CLICKS)
    conversions = _int_total(campaigns, MetricId.CONVERSIONS)
    conversion_value = _total(campaigns, MetricId.CONVERSION_VALUE)

    computed = compute_derived_metrics(
        spend=spend or Decimal(0),
        impressions=impressions or 0,
        clicks=clicks or 0,
        conversions=conversions or 0,
        conversion_value=conversion_value or Decimal(0),
    )

    return {
        MetricId.SPEND.value: _optional(spend),
        MetricId.IMPRESSIONS.value: _optional(impressions),
        MetricId.CLICKS.value: _optional(clicks),
        MetricId.CTR.value: _optional(
            _dependent(computed[MetricId.CTR.value], impressions, clicks)
        ),
        MetricId.CPC.value: _optional(
            _dependent(computed[MetricId.CPC.value], spend, clicks)
        ),
        MetricId.CONVERSIONS.value: _optional(conversions),
        MetricId.CONVERSION_VALUE.value: _optional(conversion_value),
        MetricId.ROAS.value: _optional(
            _dependent(computed[MetricId.ROAS.value], spend, conversion_value)
        ),
        MetricId.CPA.value: _optional(
            _dependent(computed[MetricId.CPA.value], spend, conversions)
        ),
    }


def _platform_table(export: ParsedExport) -> dict[str, Any]:
    received = bool(export.data)
    return {
        "received": received,
        "kpis": _kpi_row(_campaigns(export)) if received else dict(_NONE_ROW),
    }


def _top_campaigns(
    google_export: ParsedExport, meta_export: ParsedExport
) -> list[dict[str, Any]]:
    tagged = [
        (platform, campaign)
        for platform, export in (("google", google_export), ("meta", meta_export))
        for campaign in _campaigns(export)
    ]
    tagged.sort(key=lambda pc: (-_metric(pc[1], MetricId.SPEND), pc[0], pc[1]["name"]))
    return [
        {"platform": platform, "name": campaign["name"], **_kpi_row([campaign])}
        for platform, campaign in tagged[:_TOP_CAMPAIGN_COUNT]
    ]


def _meta_conversions_note(meta_export: ParsedExport) -> str:
    label = meta_export.data.get("results_column_label")
    column = (
        f'the "{label}" column'
        if label
        else "whatever column its export labelled as Results"
    )
    return f"Meta conversions: {column}."


def _definitions_footnote(
    google_received: bool, meta_export: ParsedExport, meta_received: bool
) -> str:
    parts = []
    if google_received:
        parts.append(_GOOGLE_CONVERSIONS_NOTE)
    if meta_received:
        parts.append(_meta_conversions_note(meta_export))
    parts.append(_DERIVED_METRICS_NOTE)
    return " ".join(parts)


def build_kpi_table_section(analysis_input: AnalysisInput) -> FindingsSection:
    google_export = _export_for(analysis_input.exports, "google")
    meta_export = _export_for(analysis_input.exports, "meta")
    google_received = bool(google_export.data)
    meta_received = bool(meta_export.data)

    return FindingsSection(
        title=SECTION_TITLE,
        status=SectionStatus.COMPUTED,
        payload={
            "platforms": {
                "google": _platform_table(google_export),
                "meta": _platform_table(meta_export),
            },
            "combined": _kpi_row(_campaigns(google_export) + _campaigns(meta_export)),
            "top_campaigns": _top_campaigns(google_export, meta_export),
            "definitions_footnote": _definitions_footnote(
                google_received, meta_export, meta_received
            ),
        },
    )
