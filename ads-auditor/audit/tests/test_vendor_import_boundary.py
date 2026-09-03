import ast
import sys
from pathlib import Path

_VENDOR_ROOT = Path(__file__).resolve().parent.parent / "vendor"
_ANALYSIS_CORE_DIR = _VENDOR_ROOT / "analysis_core"

_MIN_ANALYSIS_CORE_MODULES = 2

_ALLOWED_APP_MODULES = frozenset(
    {
        "app.core.metrics",
        "app.core.enums.health_check",
    }
)

_STDLIB_MODULES = sys.stdlib_module_names


def _scan(directory: Path, pattern: str, minimum: int) -> list[Path]:
    paths = sorted(directory.rglob(pattern))
    assert len(paths) >= minimum, (
        f"{directory} matched {len(paths)} '{pattern}' files, expected at least "
        f"{minimum}."
    )
    return paths


def _imported_modules(tree: ast.Module) -> list[tuple[str, int]]:
    modules: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.extend((alias.name, node.lineno) for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.append((node.module, node.lineno))
    return modules


def _forbidden_imports(tree: ast.Module) -> list[tuple[str, int]]:
    offenders: list[tuple[str, int]] = []
    for module, lineno in _imported_modules(tree):
        top = module.split(".")[0]
        if top in ("analysis_core", *_STDLIB_MODULES):
            continue
        if top == "app" and module in _ALLOWED_APP_MODULES:
            continue
        offenders.append((module, lineno))
    return offenders


def test_no_forbidden_imports_in_vendored_analysis_core() -> None:
    offenders = [
        f"{path.relative_to(_VENDOR_ROOT)}:{lineno}: {module}"
        for path in _scan(_ANALYSIS_CORE_DIR, "*.py", _MIN_ANALYSIS_CORE_MODULES)
        for module, lineno in _forbidden_imports(
            ast.parse(path.read_text(encoding="utf-8"))
        )
    ]
    assert not offenders, (
        "vendored analysis_core must stay framework-free, matching its upstream "
        "contract: " + "; ".join(offenders)
    )
