"""DTOs for parsing and validating one audit-report intake submission."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from analysis_core.models import AnalysisInput, DateWindow
from app.core.enums import AuditReportIntakeStatus, IntakeNoticeSeverity
from app.core.metrics import MetricId

__all__ = [
    "CampaignRow",
    "IntakeContext",
    "IntakeNotice",
    "IntakeOutcome",
    "OptionalCampaignColumns",
    "PlatformParseResult",
    "RawExportFile",
    "ValidationResult",
]


@dataclass(frozen=True)
class RawExportFile:
    """One uploaded file, unparsed."""

    filename: str
    content_type: str
    content: bytes


@dataclass(frozen=True)
class IntakeContext:
    """The submission's non-file form fields."""

    brand: str
    website: str
    store_revenue: Decimal | None = None


@dataclass(frozen=True)
class CampaignRow:
    """One campaign-level row from a parsed export, in the platform's own vocabulary."""

    campaign_name: str
    campaign_type: str
    metrics: Mapping[MetricId, Decimal]
    conversion_action: str | None = None
    objective: str = ""
    bid_strategy: str = ""
    daily_budget: Decimal | None = None


@dataclass(frozen=True)
class OptionalCampaignColumns:
    """The nice-to-have settings columns an export may or may not carry."""

    conversion_action: Any | None = None
    objective: Any | None = None
    bid_strategy: Any | None = None
    budget: Any | None = None


@dataclass(frozen=True)
class IntakeNotice:
    """An engineering-facing diagnostic. Never shown to the customer."""

    check_id: str
    severity: IntakeNoticeSeverity
    message: str


@dataclass(frozen=True)
class PlatformParseResult:
    """Everything extracted from one platform's export file."""

    platform: str
    currency: str | None
    date_window: DateWindow | None
    rows: tuple[CampaignRow, ...]
    rejected_row_count: int
    has_conversion_action_breakdown: bool
    has_keyword_data: bool
    notices: tuple[IntakeNotice, ...]
    # The literal header alias that resolved to the platform's "conversions" column (Meta:
    # RESULTS) -- e.g. "results" vs "purchases". None where a platform has no such ambiguity.
    results_column_label: str | None = None


@dataclass(frozen=True)
class ValidationResult:
    """The cross-file rules applied to one submission's parsed platform(s)."""

    status: AuditReportIntakeStatus
    halt_reason: str | None
    cross_platform_available: bool
    cross_platform_unavailable_reason: str | None
    overlap_window: DateWindow | None
    notices: tuple[IntakeNotice, ...]


@dataclass(frozen=True)
class IntakeOutcome:
    """The result of validating one submission, both platforms considered together."""

    status: AuditReportIntakeStatus
    halt_reason: str | None
    google: PlatformParseResult | None
    meta: PlatformParseResult | None
    cross_platform_available: bool
    cross_platform_unavailable_reason: str | None
    notices: tuple[IntakeNotice, ...]
    analysis_input: AnalysisInput | None
