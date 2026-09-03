#!/usr/bin/env python3
"""Parses two local ad-platform exports and prints a findings document."""

import argparse
import dataclasses
import json
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "vendor"))

from analysis_core.document import assemble_findings_document
from analysis_core.models import FindingsDocument, FindingsSection
from app.core.enums import AuditReportIntakeStatus, Platform
from app.services.audit_intake.analysis_input import build_analysis_input
from app.services.audit_intake.models import IntakeContext, RawExportFile
from app.services.audit_intake.parsing import ParsingError, parse_export
from app.services.audit_intake.validation import validate_submission

_CONTENT_TYPES = {
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
}

_PLUGIN_CALL_TO_ACTION = (
    "This ran entirely on your machine, so there is nothing further to send us "
    "about your ad accounts. If a finding above is worth a second pair of eyes, "
    "share this report -- not your export files -- and we can walk through it "
    "together."
)


class AuditRunError(Exception):
    """Bad input or a validation halt -- a local audit could not produce a report."""


def read_raw_export(path: Path) -> RawExportFile:
    if not path.is_file():
        raise AuditRunError(f"export file not found: {path}")
    content_type = _CONTENT_TYPES.get(path.suffix.lower(), "text/csv")
    return RawExportFile(
        filename=path.name,
        content_type=content_type,
        content=path.read_bytes(),
    )


def _with_plugin_closing_cta(document: FindingsDocument) -> FindingsDocument:
    sections = list(document.sections)
    closing = sections[-1]
    if closing.payload is not None and "call_to_action" in closing.payload:
        sections[-1] = dataclasses.replace(
            closing,
            payload={**closing.payload, "call_to_action": _PLUGIN_CALL_TO_ACTION},
        )
    return FindingsDocument(sections=tuple(sections))


def run_audit(
    google_path: Path | None,
    meta_path: Path | None,
    brand: str,
    website: str,
    store_revenue: Decimal | None,
) -> FindingsDocument:
    if google_path is None and meta_path is None:
        raise AuditRunError("at least one export (Google or Meta) is required")

    google_raw = read_raw_export(google_path) if google_path is not None else None
    meta_raw = read_raw_export(meta_path) if meta_path is not None else None

    try:
        google_parsed = (
            parse_export(Platform.GOOGLE, google_raw) if google_raw else None
        )
        meta_parsed = parse_export(Platform.META, meta_raw) if meta_raw else None
    except ParsingError as error:
        raise AuditRunError(str(error)) from error

    validation = validate_submission(google_parsed, meta_parsed)
    if validation.status is not AuditReportIntakeStatus.READY:
        raise AuditRunError(
            validation.halt_reason or "submission could not be validated"
        )

    analysis_input = build_analysis_input(
        google_parsed,
        meta_parsed,
        validation,
        IntakeContext(brand=brand, website=website, store_revenue=store_revenue),
    )
    document = assemble_findings_document(analysis_input)
    return _with_plugin_closing_cta(document)


def _section_to_dict(section: FindingsSection) -> dict:
    return {
        "title": section.title,
        "status": section.status.value,
        "payload": section.payload,
        "skip_reason": section.skip_reason,
    }


def document_to_json(document: FindingsDocument) -> dict:
    return {"sections": [_section_to_dict(section) for section in document.sections]}


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--google", type=Path, default=None, help="path to the Google export"
    )
    parser.add_argument(
        "--meta", type=Path, default=None, help="path to the Meta export"
    )
    parser.add_argument("--brand", required=True)
    parser.add_argument("--website", required=True)
    parser.add_argument("--store-revenue", type=Decimal, default=None)
    parser.add_argument(
        "--out", type=Path, required=True, help="where to write the findings JSON"
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = _parse_args(argv)
    try:
        document = run_audit(
            google_path=args.google,
            meta_path=args.meta,
            brand=args.brand,
            website=args.website,
            store_revenue=args.store_revenue,
        )
    except AuditRunError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(document_to_json(document), indent=2))
    print(str(args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
