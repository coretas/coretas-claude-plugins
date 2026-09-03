"""The report's closing section -- what continuous measurement would add."""

from analysis_core.models import AnalysisInput, FindingsSection, SectionStatus
from analysis_core.sections.claimed_vs_actual import (
    SECTION_TITLE as CLAIMED_VS_ACTUAL_TITLE,
    build_claimed_vs_actual_section,
)
from analysis_core.sections.intake_summary import build_intake_summary_section

SECTION_TITLE = "What Continuous Measurement Adds"

FRAMING_LINE = (
    "This report is one snapshot, over one date range, built from the files above. "
    "Everything Section 1 could not check is exactly what continuous, reconciled "
    "measurement would remove."
)

WHAT_CONTINUOUS_MEASUREMENT_ADDS: tuple[str, ...] = (
    "Continuous monitoring in place of a single date-range snapshot",
    "Reconciled cross-platform figures in place of a one-time comparison",
    "Tracking-implementation checks that an export alone cannot answer",
    "Goal drift caught as it happens, not read after the fact",
)

CALL_TO_ACTION = (
    "See what continuous, reconciled measurement looks like for this account: "
    "request the same walkthrough offered on the audit page."
)


def build_closing_section(analysis_input: AnalysisInput) -> FindingsSection:
    intake_payload = build_intake_summary_section(analysis_input).payload
    if intake_payload is None:
        raise ValueError("Section 1 must always be computed")

    claimed_vs_actual_section = build_claimed_vs_actual_section(analysis_input)
    unavailable_sections = (
        (CLAIMED_VS_ACTUAL_TITLE,)
        if claimed_vs_actual_section.status is SectionStatus.SKIPPED
        else ()
    )

    return FindingsSection(
        title=SECTION_TITLE,
        status=SectionStatus.COMPUTED,
        payload={
            "framing_line": FRAMING_LINE,
            "what_could_not_be_checked": intake_payload["what_could_not_be_checked"],
            "unavailable_cross_platform_sections": unavailable_sections,
            "what_continuous_measurement_adds": WHAT_CONTINUOUS_MEASUREMENT_ADDS,
            "call_to_action": CALL_TO_ACTION,
        },
    )
