# Contributing

## Layout

This repository is a Claude Code marketplace holding one or more plugins.

- `.claude-plugin/marketplace.json` — the marketplace manifest and its plugin entries
- `<plugin>/.claude-plugin/plugin.json` — one manifest per plugin; this is the version that wins
  at install time
- `<plugin>/skills/<skill>/SKILL.md` — the skill Claude loads

## Before opening a pull request

Both manifests must validate in strict mode:

```bash
claude plugin validate . --strict
claude plugin validate ./tracking-doctor --strict
```

`--strict` fails on unrecognised fields and missing metadata that the runtime tolerates. CI runs
the same two commands, so a strict failure locally is a red build.

## Testing the capture harness

`tracking-doctor/capture` is a Node package with its own suite:

```bash
cd tracking-doctor/capture
npm ci
npm run test:pure   # pure units — no browser needed
npm test            # adds the browser-backed suite
```

The browser-backed tests skip themselves when no Chromium-based browser is
available, so `npm test` is green on a machine without one. Set
`TRACKING_DOCTOR_REQUIRE_BROWSER=1` to turn that skip into a failure — CI does, because a
self-skipped golden suite reports green having diffed nothing, which is worse than a red build.

Fixtures are served from `127.0.0.1` on an ephemeral port; the tests never reach
the internet. `canonicalise()` exists to strip that port, timings and browser
identity out of a capture so a golden fixture can be diffed against a live
render.

Detection tests (`lib/detect/**`) are pure — hand-built captures, no browser — and must live flat
in `test/unit/`, since `npm run test:pure` globs `test/unit/*.test.mjs`; a nested file is silently
skipped and the suite still reports green.

`skills/tracking-doctor/**` (`SKILL.md` and `references/*.md`) has its own pure suite,
`test/unit/skill.test.mjs` — no browser, no network, same flat-directory rule as above. It
asserts the token/byte budget below and that the reference filenames track
`lib/detect/vocabulary.mjs`, so a renamed signal fails the build instead of silently orphaning a
remediation file.

## Golden fixtures

`test/fixtures/golden/` holds one HTML page per deliberate defect, plus a `healthy` page with
none. Each page carries two committed goldens:

| File | What it is |
| --- | --- |
| `<name>.capture.json` | the canonical render — the offline input, so the diff needs no browser |
| `<name>.findings.json` | what `detect` makes of it — the contract CI diffs on every push |

The fixtures use the **real** tracking hosts (`www.google-analytics.com/g/collect`,
`www.googletagmanager.com/gtag/js`, …), because `lib/detect/endpoints.mjs` matches those exactly:
a fixture pointed at `127.0.0.1` detects as six `missing` findings and proves nothing.
`test/helpers/tracking-stub.mjs` fulfils them inside the browser, so the real host survives into
the capture while no test ever reaches the network. A request to any other external host is
aborted and fails the run rather than being quietly allowed through.

Regenerating needs a browser:

```bash
npm run goldens:update
```

That script writes files and nothing else. What decides whether a golden is *right* is
`test/unit/golden-intent.test.mjs`, which holds the status every fixture was written to produce —
so a regenerate that blesses a bug fails instead of landing. Update that table in the same commit
as the fixture, never afterwards.

Detection in the golden path always runs over `canonicalise()`d input. A live render carries the
fixture server's ephemeral port and real millisecond offsets, and both otherwise reach
`target.url` and the duplicate groups' `first_t_ms` / `last_t_ms`, where they make a committed
golden unrepeatable.

### Adding a fixture

1. Write `test/fixtures/golden/<name>.html` as a healthy page with exactly one defect. Everything
   beyond that defect should stay `ok`, so the golden isolates it.
2. Add `<name>` to `INTENT` in `test/unit/golden-intent.test.mjs`, listing the signals you expect
   to go non-ok.
3. `npm run goldens:update`, then `npm run test:pure`. A red intent test means the page does not
   do what you thought — fix the page, not the table.
4. Commit the `.html` and both goldens together.

## Skill invocation and model-in-the-loop eval

Everything above proves the machine is right. It cannot prove Claude loads the skill when a user
says "why isn't my pixel working", or that having loaded it, the report names the defect the
capture actually contains. That is what `eval/` covers, driven by `claude -p`.

```bash
npm run eval -- --dry-run       # what would run, spending nothing
npm run eval:trigger            # does the skill load on realistic phrasing
npm run eval:audit              # does the report name the right defect
npm run eval                    # both, the way the nightly runs it
```

It needs credentials for `claude -p`, so it is **not** part of `npm test`. Everything around the
API calls — prompts, report parsing, grading, tolerances, the CLI flags — is pure and does live in
`npm run test:pure`, with an injected fake runner in place of the CLI.

**The two layers.**

| Layer | Prompt | Tools | What a failure means |
| --- | --- | --- | --- |
| trigger | `eval/prompts.mjs`, none of which name the skill | `Skill` only | the frontmatter `description` does not earn the load |
| audit | one per golden fixture, pointed at its committed capture | `Skill`, `Bash`, `Read`, `Glob`, `Grep` | the model read correct findings and wrote the wrong thing |

The trigger layer gets no shell on purpose: the question is whether the skill loads, and a shell
turns a one-call check into a full page render. It also carries **negative controls** — prompts
adjacent to tracking that must *not* pull the skill in, because over-triggering costs every
unrelated session tokens.

**The audit layer never renders anything.** It runs `detect` over a committed capture. A
model-driven render would either reach the internet or observe six `missing` signals: the fixtures
answer for the real tracking hosts, and only `test/helpers/tracking-stub.mjs` fulfils them, inside
a browser context the tests control. Expectations come from the committed `<name>.findings.json`,
never from a second table here — that is what `golden-intent` already pins.

**The capture is staged before the run, and reading the answer key voids the run.**
`<name>.findings.json` — the grading key — sits in the same directory as `<name>.capture.json`,
and this layer has `Read` and `Glob`. So `eval/stage.mjs` copies the capture to a scratch directory
as plain `capture.json`, and only that path reaches the prompt. Belt and braces: any run whose tool
calls touch a `findings.json` or the golden directory is marked unusable whatever its report said,
because a transcribed answer is not a derived one.

**Tolerances live in `eval/tolerances.mjs`,** and the run reports a verdict against them rather
than raw model output. A model run is not deterministic; without a stated tolerance every gate is
either flaky or vacuous. A missed `not_firing` or `mismatched` fails outright — something believes
it is measured and it is not — while a missed `missing` is allowed once, because on a real page it
may be entirely deliberate. The negative controls are judged as a *rate*, not a count: an absolute
cap would silently tighten threefold at `--repeats 3` and punish the one knob that makes the
measurement better. Those numbers are calibration seeds, not measurements: tighten them from
observed nightly history, and move one only in the commit that shows why.

**A run that evaluated nothing is red.** A ratio of 0/0 is 1, so a mistyped `--only` would
otherwise print a perfect score having called the API zero times. A selector that matches no
prompt or fixture stops the run, and a layer that executed no runs fails. If a layer dies partway,
what already completed still reaches the summary and the artefact.

**The plugin is loaded with `--plugin-dir`,** which is session-scoped. An install-based harness
would test the installer as much as the skill, and would write to the developer's real settings.

**Nightly.** `.github/workflows/nightly-eval.yml` runs on a schedule and on demand — never on a
push or a pull request, since a model run costs money and fork pull requests cannot read the
secret. It needs `ANTHROPIC_API_KEY` in the repository secrets, and fails loudly when it is
absent: a skipped eval reporting green is the same failure as a self-skipped golden suite. The
verdict lands in the step summary and in an `eval-summary.json` artefact.

The result is a claim about one model. `TRACKING_DOCTOR_EVAL_MODEL` (or `--model`) pins it, and the
summary records which one answered.

## Real-site smoke list

`eval/sites.json` is the curated list re-run before each release, with a real browser and real
network:

```bash
npm run smoke:sites
npm run smoke:sites -- https://coretas.ai
```

It takes URLs and nothing else — an unknown flag is an error rather than a filtered-out argument,
because there is no dry run and every accepted argument spends money.

Statuses are pinned for `example.com` alone, where the ground truth has been stable for years.
Everywhere else the assertion is that the run completes and the report is well formed across all
six signals — a third-party site can add a tag any day, and a smoke run that goes red for that
reason is one people learn to ignore. Every entry carries a `why`; an entry nobody can justify
should be deleted rather than kept green.

## The skill's byte budget

`SKILL.md` and `references/*.md` are read by the model on every matching session, so their size
is a cost, not just documentation weight:

| Surface | Limit |
| --- | --- |
| frontmatter `description` | 80–220 characters |
| `SKILL.md` total file | ≤ 4096 bytes |
| each `references/*.md` | ≤ 8192 bytes |

These are asserted in bytes, in `test/unit/skill.test.mjs`. `claude plugin details` also reports
a token estimate, but that figure carries an unexplained per-environment offset even on
byte-identical content — treat it as an informational reading, not something to assert against.

Anything a manual run writes goes under `/tmp/tracking-doctor/`. Never point `--out` at the working
directory: this package sits inside the repository, and a scratch capture dropped beside the source
is one `git add -A` away from being committed. Tests that need a file use `mkdtemp()` and clean up
after themselves.

## Testing an install locally

```bash
claude plugin marketplace add "$(pwd)"
claude plugin install tracking-doctor@coretas
claude plugin details tracking-doctor
```

Clean up afterwards — these commands write to your real user settings:

```bash
claude plugin uninstall tracking-doctor
claude plugin marketplace remove coretas
```

## Pull requests

- Prefix the title with the Jira key, e.g. `CRM-1580: plugin repo and manifests`.
- GitLab's Jira automation does not reach this repository, so Jira transitions are manual.

## Reporting a detection problem

Open a bug report and include the URL or fixture, the signal you expected, the signal you got, and
the plugin version from `claude plugin details tracking-doctor`.
