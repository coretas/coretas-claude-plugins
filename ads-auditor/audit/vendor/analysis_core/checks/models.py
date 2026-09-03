"""The result shape every export-derived check emits."""

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from app.core.enums.health_check import HealthCheckSeverity, HealthCheckStatus


@dataclass(frozen=True)
class CheckResult:
    check_id: str
    status: HealthCheckStatus
    severity: HealthCheckSeverity
    message: str
    metadata: Mapping[str, Any] = field(default_factory=dict)
