from decimal import Decimal

from analysis_core.document import assemble_findings_document
from analysis_core.models import (
    AnalysisContext,
    AnalysisInput,
    ParsedExport,
    SectionStatus,
)
from analysis_core.sections.automated_flags import (
    SECTION_TITLE as AUTOMATED_FLAGS_TITLE,
)
from analysis_core.sections.claimed_vs_actual import (
    SECTION_TITLE as CLAIMED_VS_ACTUAL_TITLE,
)
from analysis_core.sections.closing import SECTION_TITLE as CLOSING_TITLE
from analysis_core.sections.intake_summary import SECTION_TITLE as INTAKE_SUMMARY_TITLE
from analysis_core.sections.kpi_table import SECTION_TITLE as KPI_TABLE_TITLE
from analysis_core.sections.roas_decomposition import (
    SECTION_TITLE as ROAS_DECOMPOSITION_TITLE,
)

_GOOGLE_CAMPAIGNS = [{"name": "Summer Sale", "type": "Search", "metrics": {}}]
_META_CAMPAIGNS = [{"name": "Retargeting", "type": "", "metrics": {}}]

_EXPECTED_ORDER = (
    INTAKE_SUMMARY_TITLE,
    CLAIMED_VS_ACTUAL_TITLE,
    ROAS_DECOMPOSITION_TITLE,
    KPI_TABLE_TITLE,
    AUTOMATED_FLAGS_TITLE,
    CLOSING_TITLE,
)


def _export(platform: str, campaigns: list[dict] | None) -> ParsedExport:
    data: dict = {}
    if campaigns is not None:
        data["campaigns"] = campaigns
        data["date_window"] = {"start": "2026-08-01", "end": "2026-08-31"}
    return ParsedExport(platform=platform, data=data)


def _input(store_revenue: Decimal | None = Decimal(1000)) -> AnalysisInput:
    return AnalysisInput(
        exports=(
            _export("google", _GOOGLE_CAMPAIGNS),
            _export("meta", _META_CAMPAIGNS),
        ),
        context=AnalysisContext(
            brand="Acme",
            website="acme.example",
            currency="USD",
            date_windows=(),
            store_revenue=store_revenue,
        ),
    )


def test_vendored_section_order_is_fixed() -> None:
    document = assemble_findings_document(_input())
    assert tuple(section.title for section in document.sections) == _EXPECTED_ORDER


def test_vendored_document_has_six_computed_or_explained_sections() -> None:
    document = assemble_findings_document(_input())
    assert len(document.sections) == 6
    for section in document.sections:
        assert section.status in (SectionStatus.COMPUTED, SectionStatus.SKIPPED)
