from analysis_core.models import FindingsDocument, FindingsSection, SectionStatus

from run_audit import _PLUGIN_CALL_TO_ACTION, _with_plugin_closing_cta


def _document(closing_payload: dict | None) -> FindingsDocument:
    first = FindingsSection(
        title="What We Received",
        status=SectionStatus.COMPUTED,
        payload={"brand": "Acme"},
    )
    closing = (
        FindingsSection(
            title="Closing", status=SectionStatus.COMPUTED, payload=closing_payload
        )
        if closing_payload is not None
        else FindingsSection(
            title="Closing", status=SectionStatus.SKIPPED, skip_reason="n/a"
        )
    )
    return FindingsDocument(sections=(first, closing))


def test_only_the_closing_call_to_action_is_replaced() -> None:
    document = _document(
        {"framing_line": "unchanged", "call_to_action": "service copy"}
    )
    result = _with_plugin_closing_cta(document)

    assert result.sections[0] == document.sections[0]
    assert result.sections[-1].payload["call_to_action"] == _PLUGIN_CALL_TO_ACTION
    assert result.sections[-1].payload["framing_line"] == "unchanged"
    assert result.sections[-1].title == "Closing"
    assert result.sections[-1].status is SectionStatus.COMPUTED


def test_no_op_when_closing_payload_has_no_call_to_action_key() -> None:
    document = _document({"framing_line": "unchanged"})
    result = _with_plugin_closing_cta(document)
    assert result.sections[-1].payload == {"framing_line": "unchanged"}


def test_no_op_when_closing_section_is_skipped() -> None:
    document = _document(None)
    result = _with_plugin_closing_cta(document)
    assert result.sections[-1].status is SectionStatus.SKIPPED
    assert result.sections[-1].payload is None
