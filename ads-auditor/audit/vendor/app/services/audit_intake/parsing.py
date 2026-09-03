"""CSV/XLSX -> PlatformParseResult for one uploaded Google or Meta ad-export file."""

import csv
import io
import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from dateutil import parser as dateutil_parser
from openpyxl import load_workbook

from analysis_core.models import DateWindow
from app.core.enums import IntakeNoticeSeverity, Platform
from app.core.metrics import MetricId
from app.services.audit_intake.columns import (
    GOOGLE_COLUMN_ALIASES,
    GOOGLE_METRIC_COLUMNS,
    GOOGLE_REQUIRED_COLUMNS,
    META_COLUMN_ALIASES,
    META_METRIC_COLUMNS,
    META_REQUIRED_COLUMNS,
    GoogleExportColumn,
    MetaExportColumn,
)
from app.services.audit_intake.models import (
    CampaignRow,
    IntakeNotice,
    OptionalCampaignColumns,
    PlatformParseResult,
    RawExportFile,
)

# A wholly unusable file would otherwise return one entry per rejected row.
_MAX_REPORTED_ROW_ERRORS = 20

# Header row must match at least this many known aliases to be trusted over boilerplate.
_MIN_HEADER_MATCHES = 2

# How many leading rows may be title/blank boilerplate before we give up looking for a header.
_MAX_HEADER_SEARCH_ROWS = 10

_PARENTHETICAL = re.compile(r"\(.*?\)")
_WHITESPACE = re.compile(r"\s+")
_CURRENCY_IN_PARENS = re.compile(r"\(([A-Za-z]{3})\)")
_TOTAL_ROW = re.compile(r"^total\b", re.IGNORECASE)


class ParsingError(Exception):
    """Raised when a file cannot be read as a Google/Meta export at all."""


def _normalize_header(header: str) -> str:
    without_parens = _PARENTHETICAL.sub("", header)
    return _WHITESPACE.sub(" ", without_parens).strip().lower()


def _is_xlsx(file: RawExportFile) -> bool:
    return (
        file.filename.lower().endswith(".xlsx") or "spreadsheetml" in file.content_type
    )


def _read_rows(file: RawExportFile) -> list[list[str]]:
    if _is_xlsx(file):
        try:
            workbook = load_workbook(
                io.BytesIO(file.content), read_only=True, data_only=True
            )
        except Exception as exc:  # openpyxl raises several distinct exception types
            raise ParsingError(
                f"Could not read {file.filename} as XLSX: {exc}"
            ) from exc
        sheet = workbook.active
        if sheet is None:
            raise ParsingError(f"{file.filename} has no active worksheet")
        return [
            ["" if cell is None else str(cell) for cell in row]
            for row in sheet.iter_rows(values_only=True)
        ]

    try:
        text = file.content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ParsingError(
            f"Could not decode {file.filename} as UTF-8 CSV: {exc}"
        ) from exc
    return list(csv.reader(io.StringIO(text)))


def _locate_header_row(rows: list[list[str]], aliases: dict) -> int:
    search_limit = min(len(rows), _MAX_HEADER_SEARCH_ROWS)
    for index in range(search_limit):
        normalized = [_normalize_header(cell) for cell in rows[index]]
        matches = sum(1 for cell in normalized if cell in aliases)
        if matches >= _MIN_HEADER_MATCHES:
            return index

    raise ParsingError(
        f"Could not locate a recognizable header row in the first {search_limit} rows"
    )


def _is_footer_or_blank(row: list[str]) -> bool:
    if not any(cell.strip() for cell in row):
        return True
    first_cell = row[0].strip()
    return bool(_TOTAL_ROW.match(first_cell))


def _column_index_map(header_row: list[str], aliases: dict) -> dict:
    index_map: dict = {}
    for index, cell in enumerate(header_row):
        column = aliases.get(_normalize_header(cell))
        if column is not None and column not in index_map:
            index_map[column] = index
    return index_map


def _matched_alias_label(
    header_row: list[str], aliases: dict, column: Any
) -> str | None:
    """The first normalized header text that resolves to `column` (e.g. "results" vs "purchases")."""
    for cell in header_row:
        normalized = _normalize_header(cell)
        if aliases.get(normalized) is column:
            return normalized
    return None


def _data_rows(rows: list[list[str]], header_index: int) -> list[list[str]]:
    data: list[list[str]] = []
    for row in rows[header_index + 1 :]:
        if _is_footer_or_blank(row):
            break
        data.append(row)
    return data


def _cell(row: list[str], index_map: dict, column) -> str | None:
    index = index_map.get(column)
    if index is None or index >= len(row):
        return None
    value = row[index].strip()
    return value or None


def _parse_decimal(value: str | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(value.replace(",", ""))
    except InvalidOperation:
        return None


def _parse_date(value: str | None) -> date | None:
    if value is None:
        return None
    try:
        return dateutil_parser.parse(value).date()
    except ValueError:
        return None
    except OverflowError:
        return None


def _missing_column_notices(
    platform: Platform, index_map: dict, required
) -> tuple[IntakeNotice, ...]:
    return tuple(
        IntakeNotice(
            check_id=f"{platform.value}.missing_column:{column.value}",
            severity=IntakeNoticeSeverity.BLOCKER,
            message=(
                f"{platform.value} export is missing (or renamed) the '{column.value}' column"
            ),
        )
        for column in sorted(required, key=lambda c: c.value)
        if column not in index_map
    )


def _extract_google_date_window(
    rows: list[list[str]], index_map: dict, data_rows: list[list[str]]
) -> DateWindow | None:
    if (
        GoogleExportColumn.START_DATE in index_map
        and GoogleExportColumn.END_DATE in index_map
    ):
        starts = [
            d
            for row in data_rows
            if (d := _parse_date(_cell(row, index_map, GoogleExportColumn.START_DATE)))
            is not None
        ]
        ends = [
            d
            for row in data_rows
            if (d := _parse_date(_cell(row, index_map, GoogleExportColumn.END_DATE)))
            is not None
        ]
        if starts and ends:
            return DateWindow(start=min(starts), end=max(ends))

    # Fall back to the title line, e.g. "Campaigns Aug 1, 2026 - Aug 31, 2026".
    for row in rows[:_MAX_HEADER_SEARCH_ROWS]:
        title = " ".join(cell for cell in row if cell).strip()
        if not title or " - " not in title:
            continue
        left, _, right = title.rpartition(" - ")
        start = _parse_date(_leading_date_phrase(left))
        end = _parse_date(right.strip())
        if start and end:
            return DateWindow(start=start, end=end)

    return None


def _leading_date_phrase(text: str) -> str | None:
    """The first full date phrase in a title line, e.g. "Aug 1, 2026"."""
    match = re.search(r"[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}", text)
    return match.group(0) if match else None


def _extract_meta_date_window(
    index_map: dict, data_rows: list[list[str]]
) -> DateWindow | None:
    starts = [
        d
        for row in data_rows
        if (d := _parse_date(_cell(row, index_map, MetaExportColumn.REPORTING_STARTS)))
        is not None
    ]
    ends = [
        d
        for row in data_rows
        if (d := _parse_date(_cell(row, index_map, MetaExportColumn.REPORTING_ENDS)))
        is not None
    ]
    if not starts or not ends:
        return None
    return DateWindow(start=min(starts), end=max(ends))


def _extract_meta_currency(header_row: list[str]) -> str | None:
    for cell in header_row:
        if _normalize_header(cell) == "amount spent":
            match = _CURRENCY_IN_PARENS.search(cell)
            if match:
                return match.group(1).upper()
    return None


def _row_metrics(
    row: list[str], index_map: dict, metric_columns: dict
) -> dict[MetricId, Decimal] | None:
    """A row's metrics, or None if any present metric column fails to parse as a number."""
    metrics: dict[MetricId, Decimal] = {}
    for column, metric_id in metric_columns.items():
        if column not in index_map:
            continue
        raw_value = _cell(row, index_map, column)
        if raw_value is None:
            continue
        parsed = _parse_decimal(raw_value)
        if parsed is None:
            return None
        metrics[metric_id] = parsed
    return metrics


def _row_settings(
    row: list[str], index_map: dict, columns: OptionalCampaignColumns | None
) -> tuple[str | None, str, str, Decimal | None]:
    if columns is None:
        return None, "", "", None
    conversion_action = (
        _cell(row, index_map, columns.conversion_action)
        if columns.conversion_action is not None
        else None
    )
    objective = (
        _cell(row, index_map, columns.objective) or ""
        if columns.objective is not None
        else ""
    )
    bid_strategy = (
        _cell(row, index_map, columns.bid_strategy) or ""
        if columns.bid_strategy is not None
        else ""
    )
    daily_budget = (
        _parse_decimal(_cell(row, index_map, columns.budget))
        if columns.budget is not None
        else None
    )
    return conversion_action, objective, bid_strategy, daily_budget


def _build_rows(
    data_rows: list[list[str]],
    index_map: dict,
    metric_columns: dict,
    name_column: Any,
    type_column: Any,
    settings_columns: OptionalCampaignColumns | None = None,
) -> tuple[tuple[CampaignRow, ...], int]:
    rows: list[CampaignRow] = []
    rejected = 0
    for row in data_rows:
        name = _cell(row, index_map, name_column)
        metrics = (
            _row_metrics(row, index_map, metric_columns) if name is not None else None
        )
        if name is None or metrics is None:
            rejected += 1
            continue

        campaign_type = _cell(row, index_map, type_column) or ""
        conversion_action, objective, bid_strategy, daily_budget = _row_settings(
            row, index_map, settings_columns
        )
        rows.append(
            CampaignRow(
                campaign_name=name,
                campaign_type=campaign_type,
                metrics=metrics,
                conversion_action=conversion_action,
                objective=objective,
                bid_strategy=bid_strategy,
                daily_budget=daily_budget,
            )
        )

    return tuple(rows), rejected


def parse_export(platform: Platform, file: RawExportFile) -> PlatformParseResult:
    rows = _read_rows(file)
    aliases = (
        GOOGLE_COLUMN_ALIASES if platform is Platform.GOOGLE else META_COLUMN_ALIASES
    )
    header_index = _locate_header_row(rows, aliases)
    header_row = rows[header_index]
    index_map = _column_index_map(header_row, aliases)
    data_rows = _data_rows(rows, header_index)

    # Any: Google's and Meta's column enums are unrelated types; dict/frozenset are invariant
    # in their key type, so a variable holding either concrete mapping needs a common type.
    required: frozenset[Any]
    metric_columns: dict[Any, MetricId]

    if platform is Platform.GOOGLE:
        required = GOOGLE_REQUIRED_COLUMNS
        metric_columns = GOOGLE_METRIC_COLUMNS
        raw_currency = (
            _cell(data_rows[0], index_map, GoogleExportColumn.CURRENCY_CODE)
            if data_rows
            else None
        )
        currency = raw_currency.upper() if raw_currency else None
        date_window = _extract_google_date_window(rows, index_map, data_rows)
        rows_out, rejected_row_count = _build_rows(
            data_rows,
            index_map,
            metric_columns,
            GoogleExportColumn.CAMPAIGN,
            GoogleExportColumn.CAMPAIGN_TYPE,
            settings_columns=OptionalCampaignColumns(
                conversion_action=GoogleExportColumn.CONVERSION_ACTION,
                objective=GoogleExportColumn.OBJECTIVE,
                bid_strategy=GoogleExportColumn.BID_STRATEGY_TYPE,
                budget=GoogleExportColumn.BUDGET,
            ),
        )
        has_conversion_action_breakdown = (
            GoogleExportColumn.CONVERSION_ACTION in index_map
        )
        has_keyword_data = GoogleExportColumn.SEARCH_TERM in index_map
        results_column_label = None
    else:
        required = META_REQUIRED_COLUMNS
        metric_columns = META_METRIC_COLUMNS
        currency = _extract_meta_currency(header_row)
        date_window = _extract_meta_date_window(index_map, data_rows)
        rows_out, rejected_row_count = _build_rows(
            data_rows,
            index_map,
            metric_columns,
            MetaExportColumn.CAMPAIGN_NAME,
            MetaExportColumn.OBJECTIVE,
        )
        has_conversion_action_breakdown = False
        has_keyword_data = False
        results_column_label = _matched_alias_label(
            header_row, META_COLUMN_ALIASES, MetaExportColumn.RESULTS
        )

    notices = _missing_column_notices(platform, index_map, required)

    return PlatformParseResult(
        platform=platform.value,
        currency=currency,
        date_window=date_window,
        rows=rows_out,
        rejected_row_count=rejected_row_count,
        has_conversion_action_breakdown=has_conversion_action_breakdown,
        has_keyword_data=has_keyword_data,
        notices=notices,
        results_column_label=results_column_label,
    )
