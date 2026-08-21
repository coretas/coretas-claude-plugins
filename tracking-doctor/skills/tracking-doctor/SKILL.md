---
name: tracking-doctor
description: Audit what analytics and ad tracking actually fires on a web page — GA4, Meta Pixel, Google Ads conversions, consent mode — by rendering it in a real browser. Use when asked to check, debug or audit tracking on a URL.
---

# Tracking Doctor

Observes what tracking requests a rendered page actually sends. It does not read your tag
manager or ad account configuration — only the network traffic and `dataLayer` a browser
produces.

## Run the audit

1. **Check Node.** Run `node --version`. If missing or below v20, stop and tell the user the
   audit needs Node 20+, and what to install. Do not work around it.
2. **Install dependencies if needed.** If `${CLAUDE_PLUGIN_ROOT}/capture/node_modules` does not
   exist, say you're installing one small package, then run `npm ci --omit=dev` in
   `${CLAUDE_PLUGIN_ROOT}/capture` (~13 MB, a few seconds, no browser download).
3. **Capture the page:**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/capture/capture.mjs" capture <url> \
     --raw --out "${TMPDIR:-/tmp}/tracking-doctor/<slug>.json"
   ```
4. **If it fails with `No browser available`**, the machine has neither Chrome nor Edge. Offer
   to install Chrome first; only if that's not an option, ask before running the ~150 MB
   fallback: `npx playwright-core install chromium`.
5. **Detect findings:**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/capture/capture.mjs" detect "${TMPDIR:-/tmp}/tracking-doctor/<slug>.json"
   ```
6. **Read `references/<signal>.md` only for signals whose status is not `ok`.** A clean page
   costs nothing beyond the run itself.
7. **Write the report**, format below.

## When not to use this

Not for writing analytics or tracking code, editing a GTM container, an SEO audit, or
interpreting an existing analytics report. This only observes what a rendered page sends.

## Report format

```
One-line verdict — the single most important thing found, in plain language.

| Signal | Status | What it means |
| --- | --- | --- |
| GA4 configuration | <status> | <one line> |
| Meta Pixel | <status> | <one line> |
| Conversion linker | <status> | <one line> |
| Google Ads conversions | <status> | <one line> |
| GA4 event coverage | <status> | <one line> |
| Consent mode | <status> | <one line> |

### <Signal label> — <severity>
<what was observed, from `detail` / `observed_values`>
<what to check, from references/<signal>.md>

…one block per non-ok signal only…

### What this cannot see without connected accounts
…relevant entries from references/limits.md…

Capture kept at <path> — re-running the audit on it is free and needs no network.
```

Signal labels: `ga4_config` → GA4 configuration, `meta_pixel` → Meta Pixel, `conversion_linker`
→ Conversion linker, `google_ads_conversion` → Google Ads conversions, `ga4_event_coverage` →
GA4 event coverage, `consent_mode` → Consent mode.

Status labels: `ok` → working, `missing` → not present, `mismatched` → inconsistent,
`not_firing` → not firing. (`paused` is part of the shared vocabulary but a rendered page can
never distinguish it from `missing` — see `references/limits.md`.)

Severity: `not_firing` → **high** (something believes this is measured; it isn't). `mismatched`
→ **medium** (data arrives but is inconsistent). `missing` → **low** (may be entirely
deliberate — do not alarm the user).

Report what was observed, then what to check. No score, no grade, no "you're losing money"
framing, no upsell inside a finding — every claim must trace to a value in `observed_values`.
