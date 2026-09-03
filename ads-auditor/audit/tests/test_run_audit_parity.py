import json
from decimal import Decimal
from pathlib import Path

from run_audit import document_to_json, run_audit

_FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
_EXPORTS = _FIXTURES / "exports"
_GOLDEN = _FIXTURES / "golden" / "matched_pair.findings.json"


def test_matched_pair_matches_golden_findings_document() -> None:
    document = run_audit(
        google_path=_EXPORTS / "google_matched.csv",
        meta_path=_EXPORTS / "meta_matched.csv",
        brand="Acme",
        website="acme.example",
        store_revenue=Decimal(5000),
    )
    actual = json.loads(json.dumps(document_to_json(document)))
    expected = json.loads(_GOLDEN.read_text())
    assert actual == expected


def test_golden_closing_section_carries_the_plugin_cta_not_the_service_ones() -> None:
    expected = json.loads(_GOLDEN.read_text())
    closing = expected["sections"][-1]
    assert closing["title"] == "What Continuous Measurement Adds"
    assert "not your export files" in closing["payload"]["call_to_action"]
    assert "audit page" not in closing["payload"]["call_to_action"]
