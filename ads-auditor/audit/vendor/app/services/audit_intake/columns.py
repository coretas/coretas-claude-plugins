"""Canonical columns for Google/Meta ad-export CSV/XLSX downloads, and their header aliases."""

from enum import Enum

from app.core.metrics import MetricId


class GoogleExportColumn(str, Enum):
    CAMPAIGN = "campaign"
    CAMPAIGN_TYPE = "campaign_type"
    CURRENCY_CODE = "currency_code"
    START_DATE = "start_date"
    END_DATE = "end_date"
    IMPRESSIONS = "impressions"
    CLICKS = "clicks"
    COST = "cost"
    CONVERSIONS = "conversions"
    CONVERSION_VALUE = "conversion_value"
    CONVERSION_ACTION = "conversion_action"
    SEARCH_TERM = "search_term"
    OBJECTIVE = "objective"
    BID_STRATEGY_TYPE = "bid_strategy_type"
    BUDGET = "budget"


class MetaExportColumn(str, Enum):
    CAMPAIGN_NAME = "campaign_name"
    OBJECTIVE = "objective"
    AMOUNT_SPENT = "amount_spent"
    IMPRESSIONS = "impressions"
    LINK_CLICKS = "link_clicks"
    RESULTS = "results"
    CONVERSION_VALUE = "conversion_value"
    REPORTING_STARTS = "reporting_starts"
    REPORTING_ENDS = "reporting_ends"
    FREQUENCY = "frequency"


# Normalized header text (see parsing._normalize_header) -> canonical column. Multiple raw
# headers can map to the same column across export-format revisions.
GOOGLE_COLUMN_ALIASES: dict[str, GoogleExportColumn] = {
    "campaign": GoogleExportColumn.CAMPAIGN,
    "campaign type": GoogleExportColumn.CAMPAIGN_TYPE,
    "currency code": GoogleExportColumn.CURRENCY_CODE,
    "currency": GoogleExportColumn.CURRENCY_CODE,
    "start date": GoogleExportColumn.START_DATE,
    "end date": GoogleExportColumn.END_DATE,
    "impr.": GoogleExportColumn.IMPRESSIONS,
    "impressions": GoogleExportColumn.IMPRESSIONS,
    "clicks": GoogleExportColumn.CLICKS,
    "cost": GoogleExportColumn.COST,
    "conversions": GoogleExportColumn.CONVERSIONS,
    "conv. value": GoogleExportColumn.CONVERSION_VALUE,
    "conversion value": GoogleExportColumn.CONVERSION_VALUE,
    "conversion action": GoogleExportColumn.CONVERSION_ACTION,
    "conversions (by conversion action)": GoogleExportColumn.CONVERSION_ACTION,
    "search term": GoogleExportColumn.SEARCH_TERM,
    "keyword": GoogleExportColumn.SEARCH_TERM,
    "campaign objective": GoogleExportColumn.OBJECTIVE,
    "objective": GoogleExportColumn.OBJECTIVE,
    "bid strategy type": GoogleExportColumn.BID_STRATEGY_TYPE,
    "bid strategy": GoogleExportColumn.BID_STRATEGY_TYPE,
    "budget": GoogleExportColumn.BUDGET,
}

META_COLUMN_ALIASES: dict[str, MetaExportColumn] = {
    "campaign name": MetaExportColumn.CAMPAIGN_NAME,
    "objective": MetaExportColumn.OBJECTIVE,
    "amount spent": MetaExportColumn.AMOUNT_SPENT,
    "impressions": MetaExportColumn.IMPRESSIONS,
    "link clicks": MetaExportColumn.LINK_CLICKS,
    "results": MetaExportColumn.RESULTS,
    "purchases": MetaExportColumn.RESULTS,
    "purchase conversion value": MetaExportColumn.CONVERSION_VALUE,
    "purchases conversion value": MetaExportColumn.CONVERSION_VALUE,
    "reporting starts": MetaExportColumn.REPORTING_STARTS,
    "reporting ends": MetaExportColumn.REPORTING_ENDS,
    "frequency": MetaExportColumn.FREQUENCY,
}

# A submission is unusable without these; a gap here is a named skip, never a wrong finding.
GOOGLE_REQUIRED_COLUMNS: frozenset[GoogleExportColumn] = frozenset(
    {
        GoogleExportColumn.CAMPAIGN,
        GoogleExportColumn.CAMPAIGN_TYPE,
        GoogleExportColumn.CURRENCY_CODE,
        GoogleExportColumn.IMPRESSIONS,
        GoogleExportColumn.CLICKS,
        GoogleExportColumn.COST,
        GoogleExportColumn.CONVERSIONS,
        GoogleExportColumn.CONVERSION_VALUE,
    }
)

# Absence only narrows what later sections can compute; never a notice or a halt.
GOOGLE_NICE_TO_HAVE_COLUMNS: frozenset[GoogleExportColumn] = frozenset(
    {
        GoogleExportColumn.CONVERSION_ACTION,
        GoogleExportColumn.SEARCH_TERM,
        GoogleExportColumn.OBJECTIVE,
        GoogleExportColumn.BID_STRATEGY_TYPE,
        GoogleExportColumn.BUDGET,
    }
)

GOOGLE_METRIC_COLUMNS: dict[GoogleExportColumn, MetricId] = {
    GoogleExportColumn.COST: MetricId.SPEND,
    GoogleExportColumn.IMPRESSIONS: MetricId.IMPRESSIONS,
    GoogleExportColumn.CLICKS: MetricId.CLICKS,
    GoogleExportColumn.CONVERSIONS: MetricId.CONVERSIONS,
    GoogleExportColumn.CONVERSION_VALUE: MetricId.CONVERSION_VALUE,
}

META_REQUIRED_COLUMNS: frozenset[MetaExportColumn] = frozenset(
    {
        MetaExportColumn.CAMPAIGN_NAME,
        MetaExportColumn.OBJECTIVE,
        MetaExportColumn.AMOUNT_SPENT,
        MetaExportColumn.IMPRESSIONS,
        MetaExportColumn.LINK_CLICKS,
        MetaExportColumn.RESULTS,
        MetaExportColumn.CONVERSION_VALUE,
        MetaExportColumn.REPORTING_STARTS,
        MetaExportColumn.REPORTING_ENDS,
    }
)

# Frequency is Meta's own pre-aggregated figure for the selected window, present only when the
# advertiser configures it into their export -- absence only narrows what can be checked.
META_NICE_TO_HAVE_COLUMNS: frozenset[MetaExportColumn] = frozenset(
    {MetaExportColumn.FREQUENCY}
)

META_METRIC_COLUMNS: dict[MetaExportColumn, MetricId] = {
    MetaExportColumn.AMOUNT_SPENT: MetricId.SPEND,
    MetaExportColumn.IMPRESSIONS: MetricId.IMPRESSIONS,
    MetaExportColumn.LINK_CLICKS: MetricId.CLICKS,
    MetaExportColumn.RESULTS: MetricId.CONVERSIONS,
    MetaExportColumn.CONVERSION_VALUE: MetricId.CONVERSION_VALUE,
    MetaExportColumn.FREQUENCY: MetricId.FREQUENCY,
}
