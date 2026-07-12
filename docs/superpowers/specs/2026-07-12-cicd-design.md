# CI/CD Design — Daily Report

**Date:** 2026-07-12
**Status:** Approved

## Goal

Standard (not overly strict) CI/CD for this Tauri 2 desktop app, hosted on
GitHub (public repo, so Actions runners are free):

- CI checks on pull requests and pushes to `main`.
- Tag-driven releases producing installers for **macOS Apple Silicon** and
  **Windows**, published as GitHub Releases.
- In-app auto-updates via `tauri-plugin-updater`, fed from GitHub Releases.
- No OS code signing (macOS stays ad-hoc signed, Windows unsigned); the
  install friction is documented instead.

## Decisions (settled with the user)

| Decision | Choice |
| --- | --- |
| Release trigger | Push a `v*` tag |
| PR checks | Biome + frontend build + `cargo check` (Linux runner) |
| Code signing | None; document Gatekeeper/SmartScreen workarounds |
| Auto-update | Yes — `tauri-plugin-updater` + `latest.json` on releases |
| Version management | Manual bump; release workflow guards tag ↔ config match |
| Release implementation | Official `tauri-apps/tauri-action` |

## 1. CI workflow — `.github/workflows/ci.yml`

Triggers: `pull_request` targeting `main`, and `push` to `main`.
A `concurrency` group keyed on the ref cancels superseded runs.

Two parallel jobs, both `ubuntu-latest`:

- **frontend**
  1. Checkout.
  2. `pnpm/action-setup` (pnpm version comes from `packageManager` in
     package.json).
  3. `actions/setup-node` with Node 24 and pnpm cache.
  4. `pnpm install --frozen-lockfile`.
  5. `npx @biomejs/biome ci .`
  6. `pnpm build` (tsc + vite).
- **rust**
  1. Checkout.
  2. `apt-get install` Tauri v2 Linux system deps (`libwebkit2gtk-4.1-dev`,
     `build-essential`, `curl`, `wget`, `file`, `libxdo-dev`, `libssl-dev`,
     `libayatana-appindicator3-dev`, `librsvg2-dev`).
  3. `dtolnay/rust-toolchain@stable`.
  4. `Swatinem/rust-cache` (workspace `src-tauri`).
  5. `cargo check --manifest-path src-tauri/Cargo.toml --locked`.

Expected runtime: ~3–5 min with warm caches. No clippy, rustfmt, or tests —
none are configured in the repo today; they can be added as separate steps
later without restructuring.

## 2. Release workflow — `.github/workflows/release.yml`

Trigger: push of a tag matching `v*`. `permissions: contents: write`.

- **guard job** (`ubuntu-latest`): strips the leading `v` from
  `$GITHUB_REF_NAME` and compares it to `.version` in
  `src-tauri/tauri.conf.json` (the version the bundler actually stamps on
  artifacts). On mismatch the job fails, stopping the build legs before any
  expensive work.
- **build job** (`needs: guard`), matrix:
  - `macos-latest` with `args: --target aarch64-apple-darwin` (toolchain
    installed with that target).
  - `windows-latest` (default host target).

  Each leg: checkout → pnpm/Node/Rust setup (as in CI) →
  `Swatinem/rust-cache` → `pnpm install --frozen-lockfile` →
  `tauri-apps/tauri-action` with:
  - `tagName: v__VERSION__`, `releaseName: "Daily Report v__VERSION__"`
  - `releaseDraft: true` (draft is the release gate)
  - env `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
    from repo secrets (updater artifact signing — not OS code signing).

  `tauri-action` creates/reuses one shared draft release and uploads: the
  macOS `.dmg`, the Windows NSIS `.exe`, per-platform updater artifacts +
  `.sig` files, and the aggregated `latest.json`.

**Release procedure:** bump versions → merge to `main` → `git tag vX.Y.Z &&
git push origin vX.Y.Z` → wait for the draft → write release notes →
**Publish**. Publishing is what makes
`releases/latest/download/latest.json` resolve, i.e. when existing installs
start seeing the update.

## 3. App changes — auto-updater

- Add `tauri-plugin-updater` (Cargo dependency + `@tauri-apps/plugin-updater`
  npm package), register the plugin in `lib.rs`, add `updater:default` to
  `src-tauri/capabilities/default.json`.
- One-time: `pnpm tauri signer generate` → public key committed in
  `tauri.conf.json`, private key + password stored as the two GitHub repo
  secrets named above.
- `tauri.conf.json`:
  - `bundle.createUpdaterArtifacts: true`
  - `plugins.updater.endpoints: ["https://github.com/tasjen/daily-report/releases/latest/download/latest.json"]`
  - Narrow `bundle.targets` from `"all"` to `["dmg", "nsis"]` — building both
    MSI and NSIS makes the updater manifest ambiguous; NSIS is Tauri's
    recommended Windows target for updates.
- Frontend: on app mount, run `check()`; when an update exists, show a sonner
  toast with an "Update & restart" action → `downloadAndInstall()` →
  `relaunch()`.
- **Accepted caveat:** `relaunch()` can race `tauri-plugin-single-instance`
  (documented in CLAUDE.md) — the new process may defer to the dying one and
  the app quits instead of restarting. The update is already installed at
  that point, so the failure is benign: the user reopens the app manually.
  No mitigation is built.

## 4. Documentation & extras

- **README — Install section:** download links to the Releases page; the
  macOS unquarantine one-liner for the "app is damaged" dialog
  (`xattr -d com.apple.quarantine "/Applications/Daily Report.app"`); the
  Windows SmartScreen "More info → Run anyway" note. Only the *first* install
  has this friction — updater-delivered updates bypass it.
- **Release checklist** (README or CLAUDE.md): bump the version in
  `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`
  (the guard only enforces tauri.conf.json; the other two are kept in sync
  for hygiene) → merge → tag → publish the draft.
- **`.github/dependabot.yml`** scoped to `github-actions` only, monthly, so
  pinned actions don't rot.
- **GitHub settings advice (manual, not in code):** enable branch protection
  on `main` requiring the `frontend` and `rust` CI checks.

## Out of scope (deliberately)

- OS code signing / notarization (addable later: secrets + a few
  `tauri-action` inputs; no pipeline restructuring).
- Linux builds.
- Tests, clippy, rustfmt in CI.
- Automated version bumping (release-please etc.).
