"""Assembles the report's fixed section sequence into one document."""

from analysis_core.models import AnalysisInput, FindingsDocument
from analysis_core.sections.automated_flags import build_automated_flags_section
from analysis_core.sections.claimed_vs_actual import build_claimed_vs_actual_section
from analysis_core.sections.closing import build_closing_section
from analysis_core.sections.intake_summary import build_intake_summary_section
from analysis_core.sections.kpi_table import build_kpi_table_section
from analysis_core.sections.roas_decomposition import build_roas_decomposition_section


def assemble_findings_document(analysis_input: AnalysisInput) -> FindingsDocument:
    return FindingsDocument(
        sections=(
            build_intake_summary_section(analysis_input),
            build_claimed_vs_actual_section(analysis_input),
            build_roas_decomposition_section(analysis_input),
            build_kpi_table_section(analysis_input),
            build_automated_flags_section(analysis_input),
            build_closing_section(analysis_input),
        )
    )
