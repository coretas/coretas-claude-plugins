from enum import Enum


class AudienceSource(str, Enum):
    """How the audience entered Coretas; authoritative over AudienceType for lifecycle."""

    IMPORTED = "imported"
    UPLOADED = "uploaded"
    LOOKALIKE = "lookalike"
    INTEREST_SEGMENT = "interest_segment"
    IN_MARKET = "in_market"
    REMARKETING = "remarketing"
    RULE_BASED = "rule_based"


# Platform-curated taxonomy nodes: no account owns one, and no platform reports its membership.
CURATED_TAXONOMY_SOURCES: frozenset[AudienceSource] = frozenset(
    {AudienceSource.INTEREST_SEGMENT, AudienceSource.IN_MARKET}
)


class AudienceType(str, Enum):
    """The audience's platform-side nature."""

    CUSTOM = "custom"
    CRM_BASED = "crm_based"
    RULE_BASED = "rule_based"
    LOOKALIKE = "lookalike"
    SAVED = "saved"
    IN_MARKET = "in_market"
    AFFINITY = "affinity"


# Only these are sized by the people a platform matched; every other type reports estimated reach.
MEMBERSHIP_AUDIENCE_TYPES: frozenset[AudienceType] = frozenset(
    {AudienceType.CUSTOM, AudienceType.CRM_BASED, AudienceType.RULE_BASED}
)


class AudienceStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    DELETED = "deleted"
    PENDING_UPLOAD = "pending_upload"
    UPLOAD_FAILED = "upload_failed"


class AudienceSizeState(str, Enum):
    """Whether a platform-reported audience size exists, is still coming, or never will."""

    REPORTED = "reported"
    PENDING = "pending"
    UNAVAILABLE = "unavailable"


class AudienceSizeBasis(str, Enum):
    """What a size counts: people a platform matched, or the reach a rule set could address."""

    MEMBERSHIP = "membership"
    REACH = "reach"


class AudienceSyncPolicy(str, Enum):
    LINKED_EXISTING = "linked_existing"
    DUAL_PUBLISH = "dual_publish"
    SINGLE_PLATFORM = "single_platform"


class AudienceSignalType(str, Enum):
    """Vocabulary kind for a cataloged AudienceSignal."""

    INTEREST = "interest"
    IN_MARKET = "in_market"
    AFFINITY = "affinity"
    DETAILED_TARGETING = "detailed_targeting"
    PIXEL_EVENT = "pixel_event"
    URL_PATTERN = "url_pattern"


class CustomerListStagingStatus(str, Enum):
    """Lifecycle of a staged customer-list upload."""

    STAGED = "staged"
    CONSUMED = "consumed"
    EXPIRED = "expired"


class CustomerListColumn(str, Enum):
    """A mappable PII column in an uploaded customer list."""

    EMAIL = "email"
    PHONE = "phone"
    FIRST_NAME = "first_name"
    LAST_NAME = "last_name"
    COUNTRY = "country"


class CustomerListJobState(str, Enum):
    """What a platform says about a send it was handed: applying, applied, or thrown away."""

    PENDING = "pending"
    APPLIED = "applied"
    REJECTED = "rejected"
