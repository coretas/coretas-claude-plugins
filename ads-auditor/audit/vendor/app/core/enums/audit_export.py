"""Vocabulary for prospect ad-export uploads reaching coretas.ai/audit or info@coretas.ai."""

from enum import Enum


class AuditExportSource(str, Enum):
    """Which intake channel handed Coretas the file."""

    FORM = "form"
    EMAIL = "email"


class AuditExportUploadStatus(str, Enum):
    """Lifecycle of a staged prospect export."""

    RECEIVED = "received"
    EXPIRED = "expired"
