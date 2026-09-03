from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Any


@dataclass(frozen=True)
class DateWindow:
    start: date
    end: date


@dataclass(frozen=True)
class ParsedExport:
    platform: str
    data: Mapping[str, Any]


@dataclass(frozen=True)
class AnalysisContext:
    brand: str
    website: str
    currency: str
    date_windows: tuple[DateWindow, ...]
    store_revenue: Decimal | None = None


@dataclass(frozen=True)
class AnalysisInput:
    exports: tuple[ParsedExport, ParsedExport]
    context: AnalysisContext


class SectionStatus(str, Enum):
    COMPUTED = "computed"
    SKIPPED = "skipped"


@dataclass(frozen=True)
class FindingsSection:
    title: str
    status: SectionStatus
    payload: Mapping[str, Any] | None = None
    skip_reason: str | None = None

    def __post_init__(self) -> None:
        if self.status is SectionStatus.COMPUTED:
            if self.payload is None:
                raise ValueError("a computed section must carry a payload")
            if self.skip_reason is not None:
                raise ValueError("a computed section must not carry a skip reason")
        elif self.status is SectionStatus.SKIPPED:
            if self.skip_reason is None:
                raise ValueError("a skipped section must carry its one-line reason")
            if self.payload is not None:
                raise ValueError("a skipped section must not carry a payload")


@dataclass(frozen=True)
class FindingsDocument:
    sections: tuple[FindingsSection, ...]
