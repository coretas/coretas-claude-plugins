import subprocess
import sys
from pathlib import Path

_VENDOR_ROOT = Path(__file__).resolve().parent.parent / "vendor"


def test_analysis_core_imports_with_no_application_context() -> None:
    result = subprocess.run(
        [sys.executable, "-c", "import analysis_core"],
        cwd=_VENDOR_ROOT,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert result.stderr == ""


def test_audit_intake_imports_with_no_application_context() -> None:
    result = subprocess.run(
        [sys.executable, "-c", "import app.services.audit_intake.parsing"],
        cwd=_VENDOR_ROOT,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert result.stderr == ""
