from decimal import Decimal
from pathlib import Path

import pytest

from run_audit import AuditRunError, read_raw_export, run_audit

_FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "exports"


def test_read_raw_export_resolves_extension_and_content_type() -> None:
    raw = read_raw_export(_FIXTURES / "google_matched.csv")
    assert raw.filename == "google_matched.csv"
    assert raw.content_type == "text/csv"
    assert raw.content == (_FIXTURES / "google_matched.csv").read_bytes()


def test_read_raw_export_xlsx_content_type(tmp_path: Path) -> None:
    xlsx_path = tmp_path / "export.xlsx"
    xlsx_path.write_bytes(b"not a real workbook, only the extension matters here")
    raw = read_raw_export(xlsx_path)
    assert raw.content_type == (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


def test_read_raw_export_missing_file_raises() -> None:
    with pytest.raises(AuditRunError, match="not found"):
        read_raw_export(Path("/tmp/does-not-exist-crm-1929.csv"))


def test_run_audit_missing_google_and_meta_raises() -> None:
    with pytest.raises(AuditRunError, match="at least one"):
        run_audit(
            google_path=None,
            meta_path=None,
            brand="Acme",
            website="acme.example",
            store_revenue=None,
        )


def test_run_audit_ready_pair_produces_six_sections() -> None:
    document = run_audit(
        google_path=_FIXTURES / "google_matched.csv",
        meta_path=_FIXTURES / "meta_matched.csv",
        brand="Acme",
        website="acme.example",
        store_revenue=Decimal(5000),
    )
    assert len(document.sections) == 6
