---
name: ads-auditor
description: Audit Google Ads and Meta Ads exports for wasted spend, ROAS blending, brand vs. prospecting split and conversion gaps. Use when asked to audit or health-check ad account performance from CSV or XLSX exports.
---

# Ads Auditor

Computes a health-check report from two ad-platform exports (Google Ads, Meta Ads), entirely on
this machine. Same checks as Coretas's audit service, no upload, no account.

## Run the audit

1. **Check Python.** Run `python3 --version`. If missing or below 3.11, stop and tell the user
   the audit needs Python 3.11+, and what to install. Do not work around it.
2. **Install dependencies if needed.** If `${CLAUDE_PLUGIN_ROOT}/audit/.venv` does not exist, say
   you're installing two small packages, then run:
   ```bash
   python3 -m venv "${CLAUDE_PLUGIN_ROOT}/audit/.venv"
   "${CLAUDE_PLUGIN_ROOT}/audit/.venv/bin/pip" install -q -r "${CLAUDE_PLUGIN_ROOT}/audit/requirements.txt"
   ```
3. **Locate the two exports.** Use the paths the user gave, or files they attached to this
   conversation — read those the same way you would any other attached file. At least one of
   Google or Meta is required; both is normal and enables the cross-platform sections.
4. **Run the audit:**
   ```bash
   "${CLAUDE_PLUGIN_ROOT}/audit/.venv/bin/python" "${CLAUDE_PLUGIN_ROOT}/audit/run_audit.py" \
     --google <path-or-omit> --meta <path-or-omit> --brand "<brand>" --website "<website>" \
     [--store-revenue <amount>] --out "${TMPDIR:-/tmp}/ads-auditor/<slug>/findings.json"
   ```
5. **If it exits non-zero**, the stderr line is the reason the submission couldn't be analyzed
   (a currency mismatch, an unreadable file, a missing required column) — tell the user that
   reason directly; there is no review queue on this channel.
6. **Read the JSON** and render it as markdown, per `references/report-format.md` — one entry per
   section, in the order the JSON lists them.
7. **State plainly, once, near the top**: this analysis ran entirely on your machine; nothing
   was uploaded or transmitted.

## When not to use this

Not for writing ad copy, building campaigns, or interpreting a connected ad account through
OAuth — this only reads the two files it's given.

## Report format

```
One-line verdict — the single most important finding, in plain language.

### What We Received
### Claimed vs. Actual
### ROAS Decomposition and Brand Classification
### KPI Table and Top Campaigns
### Automated Flags
### What Continuous Measurement Adds

This analysis ran entirely on your machine. Nothing was uploaded or transmitted.
```

Render every section present in the JSON, even a `"status": "skipped"` one — show its
`skip_reason` in place of numbers, never omit the heading. Full per-section field mapping is in
`references/report-format.md`.
