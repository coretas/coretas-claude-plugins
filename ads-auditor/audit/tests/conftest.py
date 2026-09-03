import sys
from pathlib import Path

_AUDIT_ROOT = Path(__file__).resolve().parent.parent
_VENDOR_ROOT = _AUDIT_ROOT / "vendor"

for path in (str(_AUDIT_ROOT), str(_VENDOR_ROOT)):
    if path not in sys.path:
        sys.path.insert(0, path)
