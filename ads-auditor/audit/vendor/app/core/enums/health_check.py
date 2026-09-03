from enum import Enum


class HealthCheckStatus(str, Enum):
    PASS = "pass"  # nosec B105
    FAIL = "fail"
    SKIP = "skip"
    ERROR = "error"


class HealthCheckSeverity(str, Enum):
    BLOCKER = "blocker"
    WARNING = "warning"
    INFO = "info"


class AccountHealthStatus(str, Enum):
    CRITICAL = "critical"
    DEGRADED = "degraded"
    UNVERIFIED = "unverified"
    HEALTHY = "healthy"


class HealthCheckId(str, Enum):
    """Every check id a registered health check can emit."""

    GOOGLE_TEST_ACCOUNT = "google.test_account"
    GOOGLE_ACCOUNT_STATUS = "google.account_status"
    GOOGLE_CONVERSION_TRACKING = "google.conversion_tracking"
    GOOGLE_AUTO_TAGGING = "google.auto_tagging"
    GOOGLE_MERCHANT_CENTER = "google.merchant_center"
    GOOGLE_CURRENCY_ALIGNMENT = "google.currency_alignment"
    META_ACCOUNT_STATUS = "meta.account_status"
    META_PAYMENT_METHOD = "meta.payment_method"
    META_PIXEL_ACTIVITY = "meta.pixel_activity"
    META_BUSINESS_VERIFICATION = "meta.business_verification"
    META_PRODUCT_CATALOG = "meta.product_catalog"
    META_CURRENCY_ALIGNMENT = "meta.currency_alignment"
    META_LEAD_FORM_TOS_ACCEPTED = "meta.lead_form_tos_accepted"
    META_CAPI_EVENT_MATCH_QUALITY = "meta.capi_event_match_quality"
    GTM_GA4_CONFIG = "gtm.ga4_config"
    GTM_META_PIXEL = "gtm.meta_pixel"
    GTM_CONVERSION_LINKER = "gtm.conversion_linker"
    GTM_GOOGLE_ADS_CONVERSION = "gtm.google_ads_conversion"
    GTM_GA4_EVENT_COVERAGE = "gtm.ga4_event_coverage"
    GTM_CONSENT_MODE = "gtm.consent_mode"
    GA4_GOAL_STREAM_SCOPE = "ga4.goal_stream_scope"
    ASSET_APPROVAL_PENDING = "asset_approval_pending"
    GOAL_PLATFORM_MAPPING = "goal_platform_mapping"
    GOAL_PUSH_DRIFT = "goal_push_drift"
    GOAL_CONFIG_UNREAD = "goal_config_unread"
    STRATEGY_PRIMARY_GOAL_MISSING = "strategy_primary_goal_missing"


class RemediationActionId(str, Enum):
    """A fix Coretas can apply itself, named once for the check and the dispatcher."""

    ENABLE_AUTO_TAGGING = "enable_auto_tagging"
