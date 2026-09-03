"""Canonical metric taxonomy for strategy and dashboard domains."""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from enum import Enum
from typing import Protocol


class TrendDirection(str, Enum):
    UP = "up"
    DOWN = "down"
    FLAT = "flat"


class MetricId(str, Enum):
    """Canonical metric identifiers used across services and API contracts."""

    SPEND = "spend"
    IMPRESSIONS = "impressions"
    CLICKS = "clicks"
    CONVERSIONS = "conversions"
    CONVERSION_VALUE = "conversion_value"
    REACH = "reach"
    LANDING_PAGE_VIEWS = "landing_page_views"
    LEADS = "leads"
    PURCHASES = "purchases"
    ROAS = "roas"
    CPA = "cpa"
    CPC = "cpc"
    CTR = "ctr"
    CPM = "cpm"
    CPL = "cpl"
    FREQUENCY = "frequency"
    CONVERSION_RATE = "conversion_rate"
    FORM_COMPLETION_RATE = "form_completion_rate"
    POST_ENGAGEMENT = "post_engagement"
    CONVERSATION_COUNT = "conversation_count"
    POST_ENGAGEMENT_RATE = "post_engagement_rate"
    COST_PER_ENGAGEMENT = "cost_per_engagement"
    COST_PER_CONVERSATION = "cost_per_conversation"


@dataclass(frozen=True)
class MetricDefinition:
    id: MetricId
    label: str
    is_derived: bool
    invert_trend: bool = False


COMMON_METRIC_REGISTRY: dict[MetricId, MetricDefinition] = {
    MetricId.SPEND: MetricDefinition(
        id=MetricId.SPEND,
        label="Spend",
        is_derived=False,
        invert_trend=True,
    ),
    MetricId.IMPRESSIONS: MetricDefinition(
        id=MetricId.IMPRESSIONS,
        label="Impressions",
        is_derived=False,
    ),
    MetricId.CLICKS: MetricDefinition(
        id=MetricId.CLICKS,
        label="Clicks",
        is_derived=False,
    ),
    MetricId.CONVERSIONS: MetricDefinition(
        id=MetricId.CONVERSIONS,
        label="Conversions",
        is_derived=False,
    ),
    MetricId.CONVERSION_VALUE: MetricDefinition(
        id=MetricId.CONVERSION_VALUE,
        label="Conversion Value",
        is_derived=False,
    ),
    MetricId.REACH: MetricDefinition(
        id=MetricId.REACH,
        label="Reach",
        is_derived=False,
    ),
    MetricId.LANDING_PAGE_VIEWS: MetricDefinition(
        id=MetricId.LANDING_PAGE_VIEWS,
        label="Landing Page Views",
        is_derived=False,
    ),
    MetricId.LEADS: MetricDefinition(
        id=MetricId.LEADS,
        label="Leads",
        is_derived=False,
    ),
    MetricId.PURCHASES: MetricDefinition(
        id=MetricId.PURCHASES,
        label="Purchases",
        is_derived=False,
    ),
    MetricId.ROAS: MetricDefinition(
        id=MetricId.ROAS,
        label="ROAS",
        is_derived=True,
    ),
    MetricId.CPA: MetricDefinition(
        id=MetricId.CPA,
        label="CPA",
        is_derived=True,
        invert_trend=True,
    ),
    MetricId.CPC: MetricDefinition(
        id=MetricId.CPC,
        label="CPC",
        is_derived=True,
        invert_trend=True,
    ),
    MetricId.CTR: MetricDefinition(
        id=MetricId.CTR,
        label="CTR",
        is_derived=True,
    ),
    MetricId.CPM: MetricDefinition(
        id=MetricId.CPM,
        label="CPM",
        is_derived=True,
        invert_trend=True,
    ),
    MetricId.CPL: MetricDefinition(
        id=MetricId.CPL,
        label="CPL",
        is_derived=True,
        invert_trend=True,
    ),
    MetricId.FREQUENCY: MetricDefinition(
        id=MetricId.FREQUENCY,
        label="Frequency",
        is_derived=True,
    ),
    MetricId.CONVERSION_RATE: MetricDefinition(
        id=MetricId.CONVERSION_RATE,
        label="Conversion Rate",
        is_derived=True,
    ),
    MetricId.FORM_COMPLETION_RATE: MetricDefinition(
        id=MetricId.FORM_COMPLETION_RATE,
        label="Form Completion Rate",
        is_derived=True,
    ),
    MetricId.POST_ENGAGEMENT: MetricDefinition(
        id=MetricId.POST_ENGAGEMENT,
        label="Post Engagement",
        is_derived=False,
    ),
    MetricId.CONVERSATION_COUNT: MetricDefinition(
        id=MetricId.CONVERSATION_COUNT,
        label="Conversation Count",
        is_derived=False,
    ),
    MetricId.POST_ENGAGEMENT_RATE: MetricDefinition(
        id=MetricId.POST_ENGAGEMENT_RATE,
        label="Post Engagement Rate",
        is_derived=True,
    ),
    MetricId.COST_PER_ENGAGEMENT: MetricDefinition(
        id=MetricId.COST_PER_ENGAGEMENT,
        label="Cost per Engagement",
        is_derived=True,
        invert_trend=True,
    ),
    MetricId.COST_PER_CONVERSATION: MetricDefinition(
        id=MetricId.COST_PER_CONVERSATION,
        label="Cost per Conversation",
        is_derived=True,
        invert_trend=True,
    ),
}

# Metrics with a backing column or live derivation today (i.e. served by MetricRow).
# AI tools expose only these; expand as new metrics become queryable.
QUERYABLE_METRICS: tuple[MetricId, ...] = (
    MetricId.SPEND,
    MetricId.IMPRESSIONS,
    MetricId.CLICKS,
    MetricId.CONVERSIONS,
    MetricId.CONVERSION_VALUE,
    MetricId.ROAS,
    MetricId.CPA,
    MetricId.CPC,
    MetricId.CTR,
    MetricId.CPM,
)

# Metrics whose only basis is a single day: reach counts people, so two days do not add, and a
# frequency over a range is the mean of per-day ratios (avg_daily_frequency). A range-scoped
# surface — a report row, an export column, a campaign-type KPI — offers neither.
NO_RANGE_BASIS_METRICS: frozenset[MetricId] = frozenset(
    {MetricId.REACH, MetricId.FREQUENCY}
)

# Metrics an amount enters, so each one names a currency. A group whose rows do not agree one
# has no unit to publish them under, while a ratio of two counts is unaffected.
MONEY_DERIVED_METRICS: frozenset[MetricId] = frozenset(
    {
        MetricId.ROAS,
        MetricId.CPA,
        MetricId.CPC,
        MetricId.CPM,
        MetricId.CPL,
        MetricId.COST_PER_ENGAGEMENT,
        MetricId.COST_PER_CONVERSATION,
    }
)

# Lean dashboard contract backed by canonical taxonomy.
DASHBOARD_METRIC_SUBSET: tuple[MetricId, ...] = (
    MetricId.SPEND,
    MetricId.IMPRESSIONS,
    MetricId.CLICKS,
    MetricId.CONVERSIONS,
    MetricId.CONVERSION_VALUE,
    MetricId.ROAS,
    MetricId.CPA,
    MetricId.CTR,
)


def compute_metric_trend(
    current: Decimal,
    previous: Decimal | None,
) -> tuple[TrendDirection, Decimal | None]:
    """Compare current vs previous period for any metric; return trend and change percent."""
    if previous is None:
        return (TrendDirection.FLAT, None)
    if previous == 0:
        return (TrendDirection.UP if current > 0 else TrendDirection.FLAT, None)

    change = (current - previous) / previous * 100
    if change > 0:
        trend = TrendDirection.UP
    elif change < 0:
        trend = TrendDirection.DOWN
    else:
        trend = TrendDirection.FLAT

    return (trend, Decimal(str(round(float(change), 1))))


def _engagement_derived_metrics(
    spend: Decimal,
    impressions: int,
    post_engagement: int | None,
    conversation_count: int | None,
) -> dict[str, Decimal | None]:
    return {
        MetricId.POST_ENGAGEMENT_RATE.value: Decimal(post_engagement)
        / Decimal(impressions)
        * 100
        if impressions and post_engagement
        else None,
        MetricId.COST_PER_ENGAGEMENT.value: spend / Decimal(post_engagement)
        if post_engagement
        else None,
        MetricId.COST_PER_CONVERSATION.value: spend / Decimal(conversation_count)
        if conversation_count
        else None,
    }


def compute_derived_metrics(
    spend: Decimal,
    impressions: int,
    clicks: int,
    conversions: int,
    conversion_value: Decimal,
    leads: int | None = None,
    leads_platform_partial: bool = False,
    post_engagement: int | None = None,
    conversation_count: int | None = None,
    currency_mixed: bool = False,
) -> dict[str, Decimal | None]:
    """Every derived metric a summed row can carry; a zero denominator is None, never 0."""
    # A count only some of a group's platforms report divides no denominator they all fed.
    comparable = None if leads_platform_partial else leads
    derived: dict[str, Decimal | None] = {
        MetricId.ROAS.value: conversion_value / spend if spend else None,
        MetricId.CPA.value: spend / Decimal(conversions) if conversions else None,
        MetricId.CPC.value: spend / Decimal(clicks) if clicks else None,
        MetricId.CTR.value: Decimal(clicks) / Decimal(impressions) * 100
        if impressions
        else None,
        MetricId.CPM.value: spend / Decimal(impressions) * 1000
        if impressions
        else None,
        MetricId.CONVERSION_RATE.value: Decimal(conversions) / Decimal(clicks) * 100
        if clicks
        else None,
        MetricId.CPL.value: spend / Decimal(comparable) if comparable else None,
        # A lead count the platform never reported is absent, not a 0% completion rate.
        MetricId.FORM_COMPLETION_RATE.value: Decimal(comparable) / Decimal(clicks) * 100
        if clicks and comparable is not None
        else None,
        **_engagement_derived_metrics(
            spend, impressions, post_engagement, conversation_count
        ),
    }
    if not currency_mixed:
        return derived

    # The amounts behind these agree no unit, so each is withheld rather than published unlabelled.
    return derived | {metric.value: None for metric in MONEY_DERIVED_METRICS}


class ReachDay(Protocol):
    """A per-day metric row exposing impressions and (nullable) reach."""

    @property
    def impressions(self) -> int: ...

    @property
    def reach(self) -> int | None: ...


def avg_daily_frequency(rows: Iterable[ReachDay]) -> Decimal | None:
    """Mean of per-day impressions/reach over days that report reach.

    Per-day rather than summed reach: summing daily reach double-counts returning
    users, deflating the value. Days without reach (e.g. Google) are excluded; None
    when no day reports reach. Shared SSOT for the Creative Fatigue analyzer and the
    get_campaign_creative_performance tool so their frequency cannot drift.
    """
    ratios = [Decimal(r.impressions) / Decimal(r.reach) for r in rows if r.reach]
    if not ratios:
        return None
    return sum(ratios, Decimal("0")) / Decimal(len(ratios))


def previous_period_range(date_range: tuple[date, date]) -> tuple[date, date]:
    """Return the date range of the same length immediately before the given range."""
    start_d, end_d = date_range
    period_days = (end_d - start_d).days + 1
    prev_end = start_d - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period_days - 1)
    return (prev_start, prev_end)
