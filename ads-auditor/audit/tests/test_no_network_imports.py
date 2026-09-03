import ast
from pathlib import Path

_AUDIT_ROOT = Path(__file__).resolve().parent.parent
_SCAN_ROOTS = (_AUDIT_ROOT / "vendor", _AUDIT_ROOT / "run_audit.py")

# Explicit, not sys.stdlib_module_names -- that would allow socket/urllib/http too.
_ALLOWED_STDLIB = frozenset(
    {
        "__future__",
        "argparse",
        "collections",
        "csv",
        "dataclasses",
        "datetime",
        "decimal",
        "enum",
        "io",
        "json",
        "pathlib",
        "re",
        "statistics",
        "sys",
        "typing",
    }
)
_ALLOWED_THIRD_PARTY = frozenset({"openpyxl", "dateutil"})
_ALLOWED_INTERNAL = frozenset({"analysis_core", "app"})


def _python_files() -> list[Path]:
    files: list[Path] = []
    for root in _SCAN_ROOTS:
        if root.is_file():
            files.append(root)
        else:
            files.extend(sorted(root.rglob("*.py")))
    assert len(files) >= 15, f"expected to scan at least 15 files, found {len(files)}"
    return files


def _imported_top_level_modules(tree: ast.Module) -> list[tuple[str, int]]:
    modules: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.extend(
                (alias.name.split(".")[0], node.lineno) for alias in node.names
            )
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.append((node.module.split(".")[0], node.lineno))
    return modules


def _forbidden_imports(tree: ast.Module) -> list[tuple[str, int]]:
    return [
        (top, lineno)
        for top, lineno in _imported_top_level_modules(tree)
        if top not in _ALLOWED_STDLIB
        and top not in _ALLOWED_THIRD_PARTY
        and top not in _ALLOWED_INTERNAL
    ]


def test_no_network_capable_imports_anywhere_in_the_audit_pipeline() -> None:
    offenders = [
        f"{path.relative_to(_AUDIT_ROOT)}:{lineno}: {top}"
        for path in _python_files()
        for top, lineno in _forbidden_imports(
            ast.parse(path.read_text(encoding="utf-8"))
        )
    ]
    assert not offenders, (
        "an audit run must never import anything network-capable: "
        + "; ".join(offenders)
    )


def test_the_gate_actually_catches_a_real_network_import() -> None:
    tree = ast.parse("import socket\nimport urllib.request\nfrom http import client\n")
    flagged = {top for top, _ in _forbidden_imports(tree)}
    assert flagged == {"socket", "urllib", "http"}
