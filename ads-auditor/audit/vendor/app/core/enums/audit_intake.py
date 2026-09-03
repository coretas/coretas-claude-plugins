"""Vocabulary for parsing and validating prospect ad-export uploads."""

from enum import Enum


class AuditReportIntakeStatus(str, Enum):
    """Lifecycle of one submission (one or two files plus context)."""

    RECEIVED = "received"
    HALTED = "halted"
    READY = "ready"


class IntakeNoticeSeverity(str, Enum):
    """How seriously an internal-only intake notice should be read."""

    INFO = "info"
    BLOCKER = "blocker"
