#!/usr/bin/env python3
"""Copies the framework-free audit-report core from a local backend checkout."""

import argparse
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

_VENDOR_ROOT = Path(__file__).resolve().parent.parent / "vendor"

_FILES = (
    "app/core/metrics.py",
    "app/core/enums/__init__.py",
    "app/core/enums/audience.py",
    "app/core/enums/audit_export.py",
    "app/core/enums/audit_intake.py",
    "app/core/enums/common.py",
    "app/core/enums/health_check.py",
    "app/services/audit_intake/__init__.py",
    "app/services/audit_intake/columns.py",
    "app/services/audit_intake/constants.py",
    "app/services/audit_intake/models.py",
    "app/services/audit_intake/parsing.py",
    "app/services/audit_intake/validation.py",
    "app/services/audit_intake/analysis_input.py",
)

_DIRS = ("analysis_core",)


def _backend_sha(backend_root: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(backend_root), "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def sync(backend_root: Path) -> None:
    if _VENDOR_ROOT.exists():
        shutil.rmtree(_VENDOR_ROOT)
    _VENDOR_ROOT.mkdir(parents=True)
    (_VENDOR_ROOT / "app" / "__init__.py").parent.mkdir(parents=True, exist_ok=True)
    (_VENDOR_ROOT / "app" / "__init__.py").write_text("")
    (_VENDOR_ROOT / "app" / "core" / "__init__.py").parent.mkdir(
        parents=True, exist_ok=True
    )
    (_VENDOR_ROOT / "app" / "core" / "__init__.py").write_text("")
    (_VENDOR_ROOT / "app" / "services" / "__init__.py").parent.mkdir(
        parents=True, exist_ok=True
    )
    (_VENDOR_ROOT / "app" / "services" / "__init__.py").write_text("")

    for relative in _FILES:
        source = backend_root / relative
        destination = _VENDOR_ROOT / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)

    for relative in _DIRS:
        source = backend_root / relative
        destination = _VENDOR_ROOT / relative
        shutil.copytree(source, destination)

    marker = _VENDOR_ROOT / "VENDORED_FROM"
    marker.write_text(
        f"backend_sha={_backend_sha(backend_root)}\n"
        f"synced_at={datetime.now(UTC).isoformat()}\n"
    )
    print(f"Vendored into {_VENDOR_ROOT} from {backend_root}")
    print(marker.read_text().strip())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-root", required=True, type=Path)
    args = parser.parse_args()
    if not (args.backend_root / "analysis_core").is_dir():
        print(
            f"error: {args.backend_root} does not look like the backend repo root",
            file=sys.stderr,
        )
        return 2
    sync(args.backend_root.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
