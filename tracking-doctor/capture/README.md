# tracking-doctor-capture

The observation engine behind the `tracking-doctor` plugin. It renders a URL in a real browser and
records what tracking actually fires: outbound requests with their params and POST bodies, plus the
full `dataLayer` push sequence.

It only **observes**. It does not judge — turning a capture into findings is a separate step.

> **Status: partial.** This package is the capture layer only (CRM-1581). Detection rules, the
> report, and the golden fixture suite land in CRM-1582/1583/1584. Sections marked _later_ below
> are placeholders to update as those ship.

## Install

```bash
npm ci
```

Needs a Chromium-based browser. An installed Chrome or Edge is preferred over downloading
Chromium; if neither exists, run `npx playwright-core install chromium`.

> _Later (CRM-1583):_ the skill will run `npm install` on first use, so end users never do this by
> hand. `node_modules` is not shipped with the plugin.

## Use

```bash
# render a page and print what fired
node capture.mjs capture https://example.com

# keep the raw artefact, then re-derive findings offline, as often as you like
node capture.mjs capture https://example.com --raw --out artefact.json
node capture.mjs replay artefact.json
```

| Flag | Purpose |
| --- | --- |
| `--out <file>` | write to a file instead of stdout |
| `--consent <accept\|none>` | dismiss cookie banners, or leave them alone |
| `--route <path>` | visit an SPA route after load; repeatable |
| `--timeout <ms>` / `--settle <ms>` | overall budget / network quiet period |
| `--raw` | emit the artefact rather than the normalised capture |
| `--canonical` | strip timings, browser identity and origins (for goldens) |
| `--headed` | show the browser, for debugging |

`node capture.mjs --help` lists them all.

## Output

Three shapes, same data:

- **artefact** (`--raw`) — the raw record of one render. Commit this; it replays offline.
- **normalised** (default) — requests split into host/path/params, POST bodies unpacked, GET and
  POST hits given one shape. This is what detection reads.
- **canonical** (`--canonical`) — normalised minus everything that varies between two runs.

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

## Tests

```bash
npm run test:pure   # no browser needed
npm test            # adds the browser-backed suite
```

Browser-backed tests skip themselves when no browser is available — the summary still reads green,
so check the test count, not just the exit code.

## Limits

It sees the rendered page, not your tag manager config. It can tell you a hit went out with a given
measurement ID, not whether that is the ID that should be there; that a tag did not fire here, not
whether it is disabled or on a trigger this page fails to satisfy.
