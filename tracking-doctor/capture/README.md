# tracking-doctor-capture

The observation engine behind the `tracking-doctor` plugin. It renders a URL in a real browser and
records what tracking actually fires: outbound requests with their params and POST bodies, the full
`dataLayer` push sequence, and the cookies left behind.

Capture and detection are two separate steps in this one package: capture **observes** the
rendered page, and `detect` turns that observation into findings expressed in the backend's own
vocabulary, so plugin output and a Coretas GTM audit can be compared string-for-string.

This package is the engine behind the `tracking-doctor` skill
(`../skills/tracking-doctor/SKILL.md`), which is what an end user actually talks to. It runs this
CLI for them — including the first-run `npm ci` — so nothing below is something a user of the
plugin needs to do by hand. What follows is for developing or testing this package directly.

## Install

```bash
npm ci
```

Needs a Chromium-based browser. An installed Chrome or Edge is preferred over downloading
Chromium; if neither exists, run `npx playwright-core install chromium`.

`node_modules` is not shipped with the plugin — a GitHub install of `tracking-doctor` arrives
with this package's source and `package-lock.json` but no dependencies, so the skill runs `npm
ci` on first use.

## Use

```bash
# render a page and print what fired
node capture.mjs capture https://example.com

# keep the raw artefact, then re-derive findings offline, as often as you like
node capture.mjs capture https://example.com --raw --out /tmp/tracking-doctor/artefact.json
node capture.mjs replay /tmp/tracking-doctor/artefact.json
node capture.mjs detect /tmp/tracking-doctor/artefact.json
```

Scratch output belongs under `/tmp/tracking-doctor/`, never in the working directory — this package
lives inside a git repository and a stray `artefact.json` next to the source is one `git add -A`
away from being committed. `--out` creates the directory for you, so the path above works as
written.

| Flag | Purpose |
| --- | --- |
| `--out <file>` | write to a file instead of stdout |
| `--consent <accept\|none>` | dismiss cookie banners, or leave them alone |
| `--route <path>` | visit an SPA route after load; repeatable |
| `--timeout <ms>` / `--settle <ms>` | overall budget / network quiet period |
| `--raw` | emit the artefact rather than the normalised capture (`capture` only) |
| `--canonical` | strip timings, browser identity and origins (for goldens) |
| `--headed` | show the browser, for debugging |

`node capture.mjs --help` lists them all.

## Output

Three shapes, same data:

- **artefact** (`--raw`) — the raw record of one render. Commit this; it replays offline.
- **normalised** (default) — requests split into host/path/params, POST bodies unpacked, GET and
  POST hits given one shape, plus the cookies left behind. This is what detection reads.
- **canonical** (`--canonical`) — normalised minus everything that varies between two runs.

The artefact and normalised capture both carry a `cookies` array: `name`, `domain`, `path`,
`secure`, `httpOnly`, `sameSite`, `session`. Values are dropped on purpose — this tool runs against
strangers' sites, and cookie values carry identifiers detection has no need to see. Existence is
all `conversion_linker` needs.

## Findings

`detect` turns a capture into six findings, one per signal, in the vocabulary the Coretas backend
uses for a GTM container audit (`app/services/gtm/enums.py`) — so plugin output and a backend audit
can be compared string-for-string.

```bash
node capture.mjs detect /tmp/tracking-doctor/artefact.json
node capture.mjs detect /tmp/tracking-doctor/artefact.json --out /tmp/tracking-doctor/findings.json
```

```json
{
  "schemaVersion": 1,
  "target": { "url": "…", "finalUrl": "…" },
  "findings": [
    { "signal": "ga4_config", "status": "ok", "detail": "…", "tag_names": [], "observed_values": {} }
  ]
}
```

The six signals, always present and always in this order: `ga4_config`, `meta_pixel`,
`conversion_linker`, `google_ads_conversion`, `ga4_event_coverage`, `consent_mode`. Each finding's
`status` is one of `ok`, `missing`, `mismatched`, `not_firing` — `paused` is part of the shared
vocabulary but describes a container-config state a rendered page cannot show, so this plugin never
emits it. `tag_names` is always `[]`: the plugin observes the page, not the tag manager, so it has
no tag names to report; the field exists for comparability with the backend's output.

These strings are the backend's own names, not labels this plugin invented — renaming one breaks
the string-for-string comparison that is the reason this JSON exists.

## Consent phases

Every request and `dataLayer` entry carries the phase it fired in. This is the contract detection
branches on, so treat these strings as API:

| Phase | Meaning |
| --- | --- |
| `pre-consent` | before the consent step, or a click was attempted and failed — nothing granted |
| `consent-click` | caused by the accept click, so the tag is **gated** on consent |
| `post-consent` | after consent was granted |
| `no-banner` | the step ran and found no banner; the page is ungated, not consented |
| `no-consent-step` | run with `--consent none`; consent was never touched |

## Golden fixtures

`test/fixtures/golden/` is the regression layer: one page per deliberate defect, one clean page,
and per page a committed canonical capture plus the findings `detect` produces from it. CI diffs
the findings on every push, so a changed rule either updates a golden deliberately or turns the
build red.

The pages hit the real tracking hosts and `test/helpers/tracking-stub.mjs` fulfils those requests
inside the browser — the host detection matches survives into the capture, and nothing reaches the
network. Regenerate with `npm run goldens:update` (needs a browser); see `CONTRIBUTING.md` for how
to add one.

## Tests

```bash
npm run test:pure   # no browser needed — includes the golden findings diff
npm test            # adds the browser-backed suite, which re-renders every fixture
```

Browser-backed tests skip themselves when no browser is available — the summary still reads green,
so check the test count, not just the exit code. `TRACKING_DOCTOR_REQUIRE_BROWSER=1` turns that
skip into a failure, which is what CI sets.

## Limits

It sees the rendered page, not your tag manager config. It can tell you a hit went out with a given
measurement ID, not whether that is the ID that should be there; that a tag did not fire here, not
whether it is disabled or on a trigger this page fails to satisfy.
