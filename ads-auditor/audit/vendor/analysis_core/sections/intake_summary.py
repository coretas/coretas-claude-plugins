"""Section 1 -- what we received: the report's honesty contract about its own inputs."""

from typing import Any

from analysis_core.models import (
    AnalysisInput,
    FindingsSection,
    ParsedExport,
    SectionStatus,
)

SECTION_TITLE = "What We Received"

DATA_SOURCE_DISCLAIMER = (
    "Nothing in this report is based on account access. Everything below is "
    "derived from the files listed above."
)

WHAT_COULD_NOT_BE_CHECKED: tuple[str, ...] = (
    "Meta account structure and settings",
    "tracking implementation",
    "anything outside the date range",
)


def _platform_summary(export: ParsedExport) -> dict[str, Any]:
    received = "campaigns" in export.data
    return {
        "platform": export.platform,
        "received": received,
        "rows_parsed": len(export.data["campaigns"]) if received else 0,
        "date_range": export.data.get("date_window"),
    }


def build_intake_summary_section(analysis_input: AnalysisInput) -> FindingsSection:
    context = analysis_input.context
    return FindingsSection(
        title=SECTION_TITLE,
        status=SectionStatus.COMPUTED,
        payload={
            "brand": context.brand,
            "website": context.website,
            "currency": context.currency,
            "store_revenue_provided": context.store_revenue is not None,
            "platforms": tuple(
                _platform_summary(export) for export in analysis_input.exports
            ),
            "data_source_disclaimer": DATA_SOURCE_DISCLAIMER,
            "what_could_not_be_checked": WHAT_COULD_NOT_BE_CHECKED,
        },
    )
