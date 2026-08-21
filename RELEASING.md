# Releasing

Releases are cut with `claude plugin tag`, which creates a `{name}--v{version}` git tag after
checking that the manifests agree.

## Steps

1. Bump `version` in `tracking-doctor/.claude-plugin/plugin.json`.
2. Validate both manifests:

   ```bash
   claude plugin validate . --strict
   claude plugin validate ./tracking-doctor --strict
   ```

3. Commit the version bump. The tag is created at `HEAD`, so anything left uncommitted is not in
   the release — and nothing stops you from tagging anyway. See the notes below.
4. Preview the tag:

   ```bash
   claude plugin tag ./tracking-doctor --dry-run
   ```

5. Create and push it:

   ```bash
   claude plugin tag ./tracking-doctor --push -m "tracking-doctor %s"
   ```

   `%s` is substituted with the version.

## Things worth knowing

**The plugin subdirectory path is required.** Running `claude plugin tag --dry-run` from the
repository root fails with `No plugin manifest found` — the command looks for
`.claude-plugin/plugin.json` in the path you give it, and ours lives one level down.

**The tag format is `tracking-doctor--v0.2.0`** — plugin name, `--v`, version.

**Version drift is caught before the tag exists.** If `plugin.json` and the marketplace entry
disagree, the command fails and names both values. Our marketplace entry deliberately carries no
`version` field, so there is nothing to drift.

**A dirty working tree is not checked.** The command tags `HEAD` whether or not you have uncommitted
or staged changes, both with `--dry-run` and without it. Verified against Claude Code 2.1.235 — an
earlier note here claimed the opposite. Check `git status` yourself before tagging.

**The tag is annotated, so it records who cut the release.** The tagger is taken from git's
`user.name` and `user.email` at the time it runs. This repository sets both locally; a fresh clone
does not, so confirm `git config user.email` before tagging from one.
