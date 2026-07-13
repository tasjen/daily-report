# Daily Report

Desktop app that automates submitting daily work reports to the LivingInsider
admin portal: it pulls each day's completed work from Jira and pre-fills the
portal's task form via browser automation, so you only have to click submit.

## Install

### macOS (Apple Silicon)

```sh
curl -fsSL https://raw.githubusercontent.com/tasjen/daily-report/main/install.sh | bash
```

The script downloads the latest release into `/Applications` and launches it.
Because the download happens via curl (which sets no quarantine attribute),
macOS's "app is damaged" dialog for unsigned apps never appears.

<details>
<summary>Manual alternative</summary>

Download the `.dmg` from the
[latest release](https://github.com/tasjen/daily-report/releases/latest) and
drag the app to Applications. The build is unsigned, so macOS will claim the
app "is damaged and can't be opened" — clear the quarantine flag once:

```sh
xattr -dr com.apple.quarantine "/Applications/Daily Report.app"
```

</details>

### Windows

Download the `*-setup.exe` from the
[latest release](https://github.com/tasjen/daily-report/releases/latest) and
run it. The build is unsigned, so SmartScreen will warn — click
**More info → Run anyway**.

### Updates

The app checks for updates on launch and offers to install them in one click.
The friction above applies to the first install only.

## Development

Requires Node 24+, pnpm, and the Rust toolchain.

```sh
pnpm install
pnpm start        # run the app in dev mode
pnpm package      # build a distributable bundle locally
```

See [CLAUDE.md](CLAUDE.md) for architecture notes, CI/CD, and the release
process.

## Releasing

Releases are cut with `pnpm bump` ([scripts/bump-version.mjs](scripts/bump-version.mjs)),
which keeps the version in sync across `package.json`,
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `Cargo.lock`, and
drives the branch/tag flow. Run it **once per release, from an up-to-date
`main`**.

```sh
# 1. Bump the version. Pass an explicit X.Y.Z or a keyword.
pnpm bump 1.2.0          # or: pnpm bump patch | minor | major

# 2. Merge the release/vX.Y.Z PR it opened, then pull main:
git switch main && git pull

# 3. Tag the release. This is what triggers the build.
pnpm bump --tag
```

**Step 1 — `pnpm bump <version>`** verifies you're on a clean, up-to-date
`main`, rewrites the version in all four files (refusing downgrades), then
creates a `release/vX.Y.Z` branch, commits, pushes, and opens the pre-filled
PR page. `patch`/`minor`/`major` increment the current version; or pass an
exact version such as `1.0.0`.

**Step 3 — `pnpm bump --tag`** re-checks that `main` is current and the tag
doesn't already exist, asks for confirmation, then pushes the `vX.Y.Z` tag —
which starts the release workflow. Add `--yes` to skip the prompt.

The tag build produces a **draft** GitHub Release for macOS (Apple Silicon)
and Windows. Before publishing, confirm the draft carries all expected
assets — `.dmg`, `.app.tar.gz` (+`.sig`), `*-setup.exe` (+`.sig`), and a
`latest.json` listing both `darwin-aarch64` and `windows-x86_64`; a missing
platform means a bundling regression. Then write the notes and **Publish** —
publishing is what makes the new version live for the in-app updater.

> Version numbers are only used at release time (the release workflow's tag
> guard, installer filenames, and the updater's comparison), so ordinary
> feature and fix PRs never touch them — only `pnpm bump` does.
