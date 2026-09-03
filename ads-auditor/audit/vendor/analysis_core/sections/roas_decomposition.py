"""Section 3 -- ROAS decomposition and brand classification."""

import re
from decimal import Decimal
from typing import Any

from analysis_core.aggregation import (
    campaign_tokens,
    campaigns_of,
    export_for,
    metric_total,
    safe_ratio,
    tokenize,
)
from analysis_core.models import AnalysisInput, FindingsSection, SectionStatus
from app.core.metrics import MetricId

SECTION_TITLE = "ROAS Decomposition and Brand Classification"

_GOOGLE = "google"
_META = "meta"

_LITERAL_BRAND_TOKENS = frozenset({"brand", "branded"})

LOW_CONFIDENCE_MESSAGE = (
    "brand split could not be determined reliably from campaign naming"
)

CLOSING_LINE = (
    "The blended figure contains both. Read 3b as the cost of collecting demand "
    "that already exists, and 3c as the cost of creating demand that does not."
)

_TRUE_BLENDED_LABEL = "true blended, based on your store revenue"
_PLATFORM_ATTRIBUTED_BLENDED_LABEL = (
    "platform-attributed blended, based on what the platforms claim"
)

_URL_PREFIX = re.compile(r"^[a-z]+://")

# Second-level labels that commonly precede a country-code TLD (acme.co.uk, acme.com.au):
# stripping only the final label would leave "co"/"com" behind as a spurious brand token.
# Not a full public-suffix list -- analysis_core stays stdlib-only and offline -- just the
# common cases that would otherwise misclassify an unrelated campaign as brand.
_COMPOUND_SLD_LABELS = frozenset({"co", "com", "org", "net", "gov", "edu", "ac", "mil"})


def _domain_minus_tld(website: str) -> str:
    host = _URL_PREFIX.sub("", website).split("/")[0].lower()
    if host.startswith("www."):
        host = host[len("www.") :]
    labels = host.split(".")
    if len(labels) < 2:
        return host
    if len(labels) >= 3 and labels[-2] in _COMPOUND_SLD_LABELS:
        return ".".join(labels[:-2])
    return ".".join(labels[:-1])


def _brand_token_set(brand: str, website: str) -> tuple[set[str], set[str]]:
    strong = tokenize(brand) | tokenize(_domain_minus_tld(website))
    return strong, strong | _LITERAL_BRAND_TOKENS


def _classify(
    campaigns: list[dict[str, Any]], tokens: set[str]
) -> list[dict[str, Any]]:
    return [c for c in campaigns if campaign_tokens([c]) & tokens]


def _blended(
    google_campaigns: list[dict[str, Any]],
    meta_campaigns: list[dict[str, Any]],
    store_revenue: Decimal | None,
) -> dict[str, Any]:
    total_spend = metric_total(google_campaigns, MetricId.SPEND) + metric_total(
        meta_campaigns, MetricId.SPEND
    )
    conversion_value = metric_total(
        google_campaigns, MetricId.CONVERSION_VALUE
    ) + metric_total(meta_campaigns, MetricId.CONVERSION_VALUE)
    platform_attributed = safe_ratio(conversion_value, total_spend)
    true_blended = (
        store_revenue / total_spend
        if store_revenue is not None and total_spend
        else None
    )
    difference = (
        true_blended - platform_attributed
        if true_blended is not None and platform_attributed is not None
        else None
    )
    return {
        "true_blended_roas": str(true_blended) if true_blended is not None else None,
        "true_blended_label": _TRUE_BLENDED_LABEL,
        "platform_attributed_blended_roas": (
            str(platform_attributed) if platform_attributed is not None else None
        ),
        "platform_attributed_blended_label": _PLATFORM_ATTRIBUTED_BLENDED_LABEL,
        "blended_difference": str(difference) if difference is not None else None,
    }


def _brand_roas(
    google_campaigns: list[dict[str, Any]], brand: str, website: str
) -> tuple[dict[str, Any], set[str]]:
    strong_tokens, full_tokens = _brand_token_set(brand, website)
    brand_campaigns = _classify(google_campaigns, full_tokens)
    if not brand_campaigns or not _classify(google_campaigns, strong_tokens):
        return {"confidence": "low", "message": LOW_CONFIDENCE_MESSAGE}, full_tokens

    google_spend = metric_total(google_campaigns, MetricId.SPEND)
    google_conversion_value = metric_total(google_campaigns, MetricId.CONVERSION_VALUE)
    brand_spend = metric_total(brand_campaigns, MetricId.SPEND)
    brand_conversion_value = metric_total(brand_campaigns, MetricId.CONVERSION_VALUE)
    brand_roas_value = safe_ratio(brand_conversion_value, brand_spend)
    spend_share = safe_ratio(brand_spend, google_spend)
    revenue_share = safe_ratio(brand_conversion_value, google_conversion_value)
    return {
        "confidence": "ok",
        MetricId.SPEND.value: str(brand_spend),
        MetricId.CONVERSION_VALUE.value: str(brand_conversion_value),
        MetricId.ROAS.value: (
            str(brand_roas_value) if brand_roas_value is not None else None
        ),
        "spend_share_of_google": (
            str(spend_share) if spend_share is not None else None
        ),
        "revenue_share_of_google": (
            str(revenue_share) if revenue_share is not None else None
        ),
    }, full_tokens


def _platform_prospecting(campaigns: list[dict[str, Any]]) -> dict[str, str | None]:
    spend = metric_total(campaigns, MetricId.SPEND)
    conversion_value = metric_total(campaigns, MetricId.CONVERSION_VALUE)
    prospecting_roas = safe_ratio(conversion_value, spend)
    return {
        MetricId.SPEND.value: str(spend),
        MetricId.CONVERSION_VALUE.value: str(conversion_value),
        MetricId.ROAS.value: (
            str(prospecting_roas) if prospecting_roas is not None else None
        ),
    }


def build_roas_decomposition_section(analysis_input: AnalysisInput) -> FindingsSection:
    context = analysis_input.context
    google_campaigns = campaigns_of(export_for(analysis_input.exports, _GOOGLE))
    meta_campaigns = campaigns_of(export_for(analysis_input.exports, _META))

    brand_payload, brand_tokens = _brand_roas(
        google_campaigns, context.brand, context.website
    )
    google_non_brand = [
        c for c in google_campaigns if not (campaign_tokens([c]) & brand_tokens)
    ]

    return FindingsSection(
        title=SECTION_TITLE,
        status=SectionStatus.COMPUTED,
        payload={
            "blended": _blended(
                google_campaigns, meta_campaigns, context.store_revenue
            ),
            "brand_roas": brand_payload,
            "prospecting_roas": {
                _GOOGLE: _platform_prospecting(google_non_brand),
                _META: _platform_prospecting(meta_campaigns),
            },
            "closing_line": CLOSING_LINE,
        },
    )
