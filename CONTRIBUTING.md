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
available, so `npm test` is green on a machine without one. CI installs Chromium
so they actually run — check the job output, not just the exit code, if you are
relying on them locally.

Fixtures are served from `127.0.0.1` on an ephemeral port; the tests never reach
the internet. `canonicalise()` exists to strip that port, timings and browser
identity out of a capture so a golden fixture can be diffed against a live
render.

Detection tests (`lib/detect/**`) are pure — hand-built captures, no browser — and must live flat
in `test/unit/`, since `npm run test:pure` globs `test/unit/*.test.mjs`; a nested file is silently
skipped and the suite still reports green.

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
