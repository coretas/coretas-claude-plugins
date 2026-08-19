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
