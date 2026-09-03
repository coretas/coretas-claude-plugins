"""Shared per-platform aggregation helpers reused across sections and comparisons."""

import re
from decimal import Decimal
from typing import Any

from analysis_core.models import ParsedExport
from app.core.metrics import MetricId

MIN_TOKEN_LENGTH = 2
TOKEN_SPLIT = re.compile(r"[^a-z0-9]+")


def campaigns_of(export: ParsedExport) -> list[dict[str, Any]]:
    return list(export.data.get("campaigns", []))


def export_for(
    exports: tuple[ParsedExport, ParsedExport], platform: str
) -> ParsedExport:
    for export in exports:
        if export.platform == platform:
            return export
    raise ValueError(f"no {platform} export in exports")


def _metric(campaign: dict[str, Any], metric_id: MetricId) -> Decimal:
    raw = campaign["metrics"].get(metric_id.value)
    return Decimal(raw) if raw is not None else Decimal(0)


def metric_total(campaigns: list[dict[str, Any]], metric_id: MetricId) -> Decimal:
    return sum((_metric(c, metric_id) for c in campaigns), Decimal(0))


def safe_ratio(numerator: Decimal, denominator: Decimal) -> Decimal | None:
    return numerator / denominator if denominator else None


def tokenize(text: str) -> set[str]:
    return {
        token
        for token in TOKEN_SPLIT.split(text.lower())
        if len(token) >= MIN_TOKEN_LENGTH
    }


def campaign_tokens(campaigns: list[dict[str, Any]]) -> set[str]:
    tokens: set[str] = set()
    for campaign in campaigns:
        tokens.update(tokenize(campaign.get("name", "")))
    return tokens
