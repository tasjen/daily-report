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
xattr -d com.apple.quarantine "/Applications/Daily Report.app"
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
