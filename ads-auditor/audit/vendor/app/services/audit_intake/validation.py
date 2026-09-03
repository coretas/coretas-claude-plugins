"""Cross-file rules for one audit-report intake submission: currency match, date-window overlap."""

from analysis_core.models import DateWindow
from app.core.enums import AuditReportIntakeStatus, IntakeNoticeSeverity
from app.services.audit_intake.models import (
    IntakeNotice,
    PlatformParseResult,
    ValidationResult,
)

_REQUIRES_BOTH_EXPORTS = "requires both exports"

# Beyond this, a window gap is worth flagging to whoever reviews the submission -- it may mean
# the prospect exported different reporting periods for each platform by mistake. It never
# halts and never narrows the overlap computed below; it is purely an internal notice.
_WINDOW_MISMATCH_NOTICE_THRESHOLD_DAYS = 3


def _require_window(result: PlatformParseResult) -> DateWindow:
    """Only ever called after validate_submission's _missing_fact_halt clears both sides."""
    if result.date_window is None:
        raise ValueError(f"{result.platform} export has no date window")
    return result.date_window


def _window_mismatch_notice(
    google: PlatformParseResult, meta: PlatformParseResult
) -> IntakeNotice | None:
    google_window = _require_window(google)
    meta_window = _require_window(meta)
    start_gap = abs((google_window.start - meta_window.start).days)
    end_gap = abs((google_window.end - meta_window.end).days)
    if max(start_gap, end_gap) <= _WINDOW_MISMATCH_NOTICE_THRESHOLD_DAYS:
        return None
    return IntakeNotice(
        check_id="date_window_mismatch",
        severity=IntakeNoticeSeverity.INFO,
        message=(
            f"date windows differ by more than {_WINDOW_MISMATCH_NOTICE_THRESHOLD_DAYS} days: "
            f"{google.platform}={google_window.start}..{google_window.end}, "
            f"{meta.platform}={meta_window.start}..{meta_window.end}"
        ),
    )


def _halted(reason: str, notice: IntakeNotice) -> ValidationResult:
    return ValidationResult(
        status=AuditReportIntakeStatus.HALTED,
        halt_reason=reason,
        cross_platform_available=False,
        cross_platform_unavailable_reason=None,
        overlap_window=None,
        notices=(notice,),
    )


def _missing_fact_halt(result: PlatformParseResult) -> ValidationResult | None:
    """An unresolvable currency or date window halts, same as a currency mismatch."""
    if result.currency is None:
        return _halted(
            f"currency unknown for the {result.platform} export",
            IntakeNotice(
                check_id=f"{result.platform}.currency_unknown",
                severity=IntakeNoticeSeverity.BLOCKER,
                message=f"could not determine a currency for the {result.platform} export",
            ),
        )
    if result.date_window is None:
        return _halted(
            f"date window unknown for the {result.platform} export",
            IntakeNotice(
                check_id=f"{result.platform}.date_window_unknown",
                severity=IntakeNoticeSeverity.BLOCKER,
                message=f"could not determine a date window for the {result.platform} export",
            ),
        )
    return None


def _currency_halt(
    google: PlatformParseResult, meta: PlatformParseResult
) -> ValidationResult | None:
    if google.currency != meta.currency:
        return _halted(
            f"currency mismatch: {google.platform} export is {google.currency}, "
            f"{meta.platform} export is {meta.currency}",
            IntakeNotice(
                check_id="currency_mismatch",
                severity=IntakeNoticeSeverity.BLOCKER,
                message=(
                    f"{google.platform}={google.currency} vs {meta.platform}={meta.currency}"
                ),
            ),
        )
    return None


def _overlap(
    google: PlatformParseResult, meta: PlatformParseResult
) -> ValidationResult:
    google_window = _require_window(google)
    meta_window = _require_window(meta)
    start = max(google_window.start, meta_window.start)
    end = min(google_window.end, meta_window.end)
    if start > end:
        return ValidationResult(
            status=AuditReportIntakeStatus.READY,
            halt_reason=None,
            cross_platform_available=False,
            cross_platform_unavailable_reason="date ranges do not overlap",
            overlap_window=None,
            notices=(),
        )

    notice = _window_mismatch_notice(google, meta)
    return ValidationResult(
        status=AuditReportIntakeStatus.READY,
        halt_reason=None,
        cross_platform_available=True,
        cross_platform_unavailable_reason=None,
        overlap_window=DateWindow(start=start, end=end),
        notices=(notice,) if notice is not None else (),
    )


def _single_export(result: PlatformParseResult) -> ValidationResult:
    halt = _missing_fact_halt(result)
    if halt is not None:
        return halt
    return ValidationResult(
        status=AuditReportIntakeStatus.READY,
        halt_reason=None,
        cross_platform_available=False,
        cross_platform_unavailable_reason=_REQUIRES_BOTH_EXPORTS,
        overlap_window=None,
        notices=(),
    )


def validate_submission(
    google: PlatformParseResult | None, meta: PlatformParseResult | None
) -> ValidationResult:
    if google is not None and meta is not None:
        halt = _missing_fact_halt(google) or _missing_fact_halt(meta)
        return halt or _currency_halt(google, meta) or _overlap(google, meta)
    if google is not None:
        return _single_export(google)
    if meta is not None:
        return _single_export(meta)
    raise ValueError("at least one export is required")
