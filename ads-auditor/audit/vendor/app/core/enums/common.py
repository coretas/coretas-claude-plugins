from enum import Enum


class Platform(str, Enum):
    GOOGLE = "google"
    META = "meta"
    AMAZON = "amazon"
    TIKTOK = "tiktok"
    SHOPIFY = "shopify"
    GA4 = "ga4"
    GTM = "gtm"


class AssetSource(str, Enum):
    SYNCED = "synced"
    SCRAPED = "scraped"
    UPLOADED = "uploaded"


class CreativeAssetKind(str, Enum):
    BUSINESS_NAME = "business_name"
    LOGO = "logo"
    MARKETING_IMAGE = "marketing_image"
    SQUARE_MARKETING_IMAGE = "square_marketing_image"
    IMAGE = "image"
    VIDEO = "video"


class CreativeAssetStatus(str, Enum):
    PENDING_METADATA = "pending_metadata"
    ACTIVE = "active"
    INVALID = "invalid"
    ARCHIVED = "archived"


class PlatformAssetSyncStatus(str, Enum):
    PENDING = "pending"
    SYNCING = "syncing"
    SYNCED = "synced"
    PENDING_REVIEW = "pending_review"
    REJECTED = "rejected"
    FAILED = "failed"
    INVALID = "invalid"  # asset does not meet this platform's spec; not retryable


class MetaAudienceType(str, Enum):
    CUSTOM = "custom"
    LOOKALIKE = "lookalike"


class GoogleResourceKind(str, Enum):
    """What a Google resource name the campaign editor holds refers to."""

    USER_LIST = "user_list"
    CUSTOM_AUDIENCE = "custom_audience"
    # Neither is offered by a picker; both are carried so a re-imported criterion reads as words.
    USER_INTEREST = "user_interest"
    TOPIC = "topic"


class AssetPlacement(str, Enum):
    """Platform-agnostic aspect/format role of a creative-asset variant."""

    SQUARE = "square"
    LANDSCAPE = "landscape"
    PORTRAIT = "portrait"
    STORY = "story"


class Environment(str, Enum):
    LOCAL = "local"
    DEVELOPMENT = "development"
    PRODUCTION = "production"


class DateRangeEnum(str, Enum):
    """Preset date range for metric and report queries."""

    LAST_7D = "LAST_7D"
    LAST_14D = "LAST_14D"
    LAST_30D = "LAST_30D"
    LAST_90D = "LAST_90D"
    CUSTOM = "CUSTOM"


class UserRole(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    STANDARD = "STANDARD"
    VIEWER = "VIEWER"


class OrganizationStatus(str, Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    DELETED = "DELETED"


class MessageContextType(str, Enum):
    STRATEGY = "strategy"
    WIZARD = "wizard"
    CAMPAIGN = "campaign"
    REPORTS = "reports"
    WORKSPACE = "workspace"
    ASSET_LIBRARY = "asset_library"
    AUDIENCE_LIBRARY = "audience_library"
    GOAL_TRACKING = "goal_tracking"
    PRODUCT_CATEGORY = "product_category"
    RECOMMENDATION = "recommendation"


class WizardStep(str, Enum):
    """Create-strategy wizard UI step, used to scope WIZARD suggestion chips.

    Distinct from ``CreateStrategyWizardStep`` (the persisted draft progress
    marker in ``app.services.strategy_wizard.enums``).
    """

    BRIEF = "brief"
    PLAN = "plan"
    CAMPAIGNS = "campaigns"


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"


class MessageFeedback(str, Enum):
    HELPFUL = "HELPFUL"
    NOT_HELPFUL = "NOT_HELPFUL"


class ThreadStatus(str, Enum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"
    PINNED = "PINNED"


class TitleSource(str, Enum):
    """Provenance of a thread title — guards auto-titling from clobbering a
    user-chosen title."""

    AUTO = "AUTO"
    USER = "USER"


class LLMFeature(str, Enum):
    COPILOT = "copilot"
    MEDIA_PLAN_GENERATION = "media_plan_generation"
    CAMPAIGN_GENERATION = "campaign_generation"
    CREATIVE_TEXT_GENERATION = "creative_text_generation"
    COPILOT_COMMAND = "copilot_command"
    FORECASTING = "forecasting"
    AI_MONITOR = "ai_monitor"
    DEFAULT_ASSET_RANKING = "default_asset_ranking"
    EMBEDDING = "embedding"


class EvalFeature(str, Enum):
    """Feature buckets scored by the offline eval harness (`tests/eval`).

    Distinct from `LLMFeature`: these name eval suites, not logged LLM calls.
    """

    GENERATION = "generation"
    COPILOT = "copilot"
    RECOMMENDATIONS = "recommendations"
    INSIGHTS = "insights"


class Language(str, Enum):
    """Common language codes for targeting."""

    ENGLISH = "en"
    SPANISH = "es"
    FRENCH = "fr"
    GERMAN = "de"
    ITALIAN = "it"
    PORTUGUESE = "pt"
    DUTCH = "nl"
    RUSSIAN = "ru"
    JAPANESE = "ja"
    KOREAN = "ko"
    CHINESE = "zh"


class SSEEvent(str, Enum):
    """SSE wire envelope (`event:` field). Transport vocabulary only — domain
    status (job lifecycle, onboarding narration) lives in the payload."""

    CONNECTED = "connected"
    PROGRESS = "progress"
    ERROR = "error"
    # Per-job terminal frames: only the per-job channel emits these so the
    # client can settle a single-job promise. The org activity stream sends
    # everything as PROGRESS with the status in the payload.
    JOB_COMPLETED = "job_completed"
    JOB_FAILED = "job_failed"


class InsightSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"

    @property
    def rank(self) -> int:
        """Severity ordering, higher = more severe; the one source for both sorts."""
        return _INSIGHT_SEVERITY_RANK[self]


_INSIGHT_SEVERITY_RANK = {
    InsightSeverity.INFO: 1,
    InsightSeverity.WARNING: 2,
    InsightSeverity.CRITICAL: 3,
}


class InsightType(str, Enum):
    PERFORMANCE_SHIFT = "performance_shift"
    SPEND_ANOMALY = "spend_anomaly"
    PACING_ALERT = "pacing_alert"
    TREND = "trend"
    OPPORTUNITY = "opportunity"
    MONTHLY_DIGEST = "monthly_digest"


class LearningCategory(str, Enum):
    RECOMMENDATION_FEEDBACK = "recommendation_feedback"
    CAMPAIGN_OUTCOME = "campaign_outcome"
    INSIGHT_FEEDBACK = "insight_feedback"


class TrustBasis(str, Enum):
    """Whether a figure came from a measurement source or the ad platform's own reporting."""

    VERIFIED = "verified"
    CLAIMED = "claimed"
