import re
from pathlib import Path

_SKILL_DIR = Path(__file__).resolve().parent.parent.parent / "skills" / "ads-auditor"
_SKILL_PATH = _SKILL_DIR / "SKILL.md"
_REFERENCES_DIR = _SKILL_DIR / "references"

_SECTION_TITLES = (
    "What We Received",
    "Claimed vs. Actual",
    "ROAS Decomposition and Brand Classification",
    "KPI Table and Top Campaigns",
    "Automated Flags",
    "What Continuous Measurement Adds",
)


def _parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    match = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.DOTALL)
    assert match is not None, "SKILL.md must start with a --- frontmatter block"
    frontmatter_text, body = match.groups()
    frontmatter = dict(
        re.match(r"^([a-zA-Z_]+):\s?(.*)$", line).groups()  # type: ignore[union-attr]
        for line in frontmatter_text.splitlines()
    )
    return frontmatter, body


def test_skill_exists_and_parses() -> None:
    text = _SKILL_PATH.read_text()
    frontmatter, body = _parse_frontmatter(text)
    assert frontmatter["name"]
    assert frontmatter["description"]
    assert body.strip()


def test_skill_name_is_ads_auditor() -> None:
    frontmatter, _ = _parse_frontmatter(_SKILL_PATH.read_text())
    assert frontmatter["name"] == "ads-auditor"


def test_description_is_80_to_220_chars_and_single_line() -> None:
    frontmatter, _ = _parse_frontmatter(_SKILL_PATH.read_text())
    description = frontmatter["description"]
    assert "\n" not in description
    assert 80 <= len(description) <= 220, f"description is {len(description)} chars"


def test_description_has_no_placeholder_language() -> None:
    frontmatter, _ = _parse_frontmatter(_SKILL_PATH.read_text())
    lowered = frontmatter["description"].lower()
    for banned in ("placeholder", "not implemented", "todo"):
        assert banned not in lowered


def test_skill_md_is_at_most_4096_bytes() -> None:
    size = _SKILL_PATH.stat().st_size
    assert size <= 4096, f"SKILL.md is {size} bytes"


def test_report_format_reference_is_nonempty_and_at_most_8192_bytes() -> None:
    path = _REFERENCES_DIR / "report-format.md"
    size = path.stat().st_size
    assert 0 < size <= 8192, f"report-format.md is {size} bytes"


def test_names_all_six_section_titles() -> None:
    text = _SKILL_PATH.read_text() + (_REFERENCES_DIR / "report-format.md").read_text()
    for title in _SECTION_TITLES:
        assert title in text, f"missing section title {title!r}"


def test_references_claude_plugin_root_and_never_hardcodes_the_install_path() -> None:
    text = _SKILL_PATH.read_text()
    assert "${CLAUDE_PLUGIN_ROOT}" in text
    assert "~/.claude/plugins" not in text


def test_documents_the_python_preflight() -> None:
    text = _SKILL_PATH.read_text()
    assert "python3 --version" in text
    assert "venv" in text


def test_states_the_local_only_disclosure() -> None:
    text = _SKILL_PATH.read_text()
    assert "ran entirely on your machine" in text


def test_closing_cta_language_asks_for_findings_not_export_files() -> None:
    text = (_REFERENCES_DIR / "report-format.md").read_text()
    assert "never the export files" in text
