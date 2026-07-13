# Version-Bump Script Design

**Date:** 2026-07-13
**Status:** Approved (fast-track: spec + direct implementation, no separate plan)

## Goal

Make the release flow's fiddly part — keeping the version in sync across
`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and
`Cargo.lock`, then branching/tagging in the right order — a two-command
operation:

```
pnpm bump 1.0.0        # or: pnpm bump major|minor|patch
# …merge the PR it opens…
pnpm bump --tag
```

## Shape

One zero-dependency Node ESM script, `scripts/bump-version.mjs`, exposed as
`"bump": "node scripts/bump-version.mjs"` in package.json. Version edits are
targeted single-line replacements (never `JSON.stringify`) so file formatting
stays byte-identical apart from the version; each replacement is verified to
match exactly once or the script aborts. The script `chdir`s to the repo root
(`git rev-parse --show-toplevel`) so it works from any cwd.

## Bump mode — `pnpm bump <version|major|minor|patch>`

1. Preconditions (each fails fast, one-line reason, non-zero exit): on
   `main`; clean tracked tree (`git status --porcelain -uno` empty; untracked
   files don't block); after `git fetch`, local `main` == `origin/main`.
2. Current version is read from `src-tauri/tauri.conf.json` (the release
   guard's source of truth). Target is an explicit `X.Y.Z` (validated) or a
   `major|minor|patch` increment, and must be **greater** than current —
   downgrades would break the updater's version comparison.
3. Rewrite the version in the three files, run
   `cargo metadata --manifest-path src-tauri/Cargo.toml` to re-resolve and
   rewrite `Cargo.lock` (same lockfile effect as the checklist's
   `cargo check` but ~1s instead of a compile; CI still runs the full
   `cargo check` on the PR), then verify `Cargo.lock`'s `daily-report` stanza
   carries the new version.
4. `git switch -c release/v<new>`, commit the four files
   (`Bump version to <new>`), `git push -u origin`, and open the prefilled
   GitHub compare page (falls back to printing the URL if `open` fails;
   `BUMP_NO_OPEN=1` skips the browser — used by tests).
5. Print the follow-up steps: merge the PR, then `pnpm bump --tag`.

## Tag mode — `pnpm bump --tag`

1. Preconditions: on `main`; clean tracked tree; local `main` ==
   `origin/main` after fetch. This ordering guard is the point — it makes
   tagging before the bump PR is merged impossible.
2. Tag is `v<version from tauri.conf.json>`; must not already exist locally
   (`git tag -l`) or on origin (`git ls-remote --tags`).
3. Confirm interactively (`Tagging v<...> — this triggers the release build.
   Continue? [y/N]`, skippable with `--yes`), then `git tag` + `git push
   origin <tag>`, and print the Actions URL plus the reminder to verify the
   draft's asset list before publishing.

## Docs

CLAUDE.md release checklist steps 1–2 become the two commands above.

## Verification (no test framework in this repo)

Exercised against a throwaway clone (bare scratch remote + work clone, so
pushes never touch the real repo): happy bump, happy tag, and the failure
paths — wrong branch, dirty tree, stale main, downgrade, malformed version,
existing tag. Biome check passes on the new file.

## Out of scope

- Creating/merging the PR itself (no `gh` CLI; merge is a human step).
- Pre-release/build-metadata semver forms (`1.0.0-rc.1`) — plain `X.Y.Z`
  only, matching what the release guard and updater manifest use today.
