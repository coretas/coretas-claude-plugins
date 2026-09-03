"""PlatformParseResult(s) -> analysis_core.AnalysisInput, only ever on the READY path."""

from collections.abc import Mapping
from typing import Any

from analysis_core.models import (
    AnalysisContext,
    AnalysisInput,
    DateWindow,
    ParsedExport,
)
from app.core.enums import AuditReportIntakeStatus, Platform
from app.services.audit_intake.models import (
    IntakeContext,
    PlatformParseResult,
    ValidationResult,
)


def _export_data(result: PlatformParseResult | None) -> Mapping[str, Any]:
    """A not-supplied platform is the empty mapping -- the documented "absent" sentinel."""
    if result is None or result.date_window is None:
        return {}
    return {
        "currency": result.currency,
        "date_window": {
            "start": result.date_window.start.isoformat(),
            "end": result.date_window.end.isoformat(),
        },
        "campaigns": [
            {
                "name": row.campaign_name,
                "type": row.campaign_type,
                "metrics": {
                    metric_id.value: str(value)
                    for metric_id, value in row.metrics.items()
                },
                "conversion_action": row.conversion_action,
                "objective": row.objective,
                "bid_strategy": row.bid_strategy,
                "daily_budget": str(row.daily_budget)
                if row.daily_budget is not None
                else None,
            }
            for row in result.rows
        ],
        "has_conversion_action_breakdown": result.has_conversion_action_breakdown,
        "has_keyword_data": result.has_keyword_data,
        "results_column_label": result.results_column_label,
        "rejected_row_count": result.rejected_row_count,
    }


def date_windows_for(
    google: PlatformParseResult | None,
    meta: PlatformParseResult | None,
    validation: ValidationResult,
) -> tuple[DateWindow, ...]:
    """Per-platform windows then the overlap if any; cross-platform data needs a length of 3."""
    windows = tuple(
        result.date_window
        for result in (google, meta)
        if result is not None and result.date_window is not None
    )
    if validation.overlap_window is not None:
        return (*windows, validation.overlap_window)
    return windows


def build_analysis_input(
    google: PlatformParseResult | None,
    meta: PlatformParseResult | None,
    validation: ValidationResult,
    context: IntakeContext,
) -> AnalysisInput:
    if validation.status is not AuditReportIntakeStatus.READY:
        raise ValueError("cannot build AnalysisInput for a non-READY submission")

    primary = google if google is not None else meta
    if primary is None or primary.currency is None:
        raise ValueError("at least one export with a known currency is required")

    return AnalysisInput(
        exports=(
            ParsedExport(platform=Platform.GOOGLE.value, data=_export_data(google)),
            ParsedExport(platform=Platform.META.value, data=_export_data(meta)),
        ),
        context=AnalysisContext(
            brand=context.brand,
            website=context.website,
            currency=primary.currency,
            date_windows=date_windows_for(google, meta, validation),
            store_revenue=context.store_revenue,
        ),
    )
