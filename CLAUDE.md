# CLAUDE.md

Guidance for working in this repository.

## What this app is

**Daily Report** is a Tauri 2 desktop app that automates submitting daily work
reports to the LivingInsider admin portal (`portal.example.com/team`). It
pulls each day's completed work from Jira and pre-fills the portal's task form
via browser automation, so the user only has to click submit.

The portal has no public API, so all interaction with it is done by driving a
real Chromium instance ([chromiumoxide](https://github.com/mattsse/chromiumoxide))
from the Rust backend. Jira, by contrast, has a REST API and is queried directly
from the frontend.

## Tech stack

- **Backend:** Rust + Tauri 2, `chromiumoxide` (CDP browser automation), `tokio`.
- **Frontend:** React 19, TypeScript, Vite 7.
- **State/data:** `@tanstack/react-query` (server state; also fronts the
  persisted store), `@tauri-apps/plugin-store` (secrets + preferences in
  `store.json`), `mutative` (immutable nested updates of cached objects).
- **HTTP:** `@tauri-apps/plugin-http` (frontend calls to Jira; required to bypass
  browser CORS).
- **UI:** Tailwind CSS v4, shadcn-style components built on `@base-ui/react`,
  `lucide-react` icons, `@formkit/auto-animate`.
- **Tooling:** Biome (lint + format), lefthook (pre-commit), pnpm.

## Commands

```bash
pnpm start      # tauri dev — run the full desktop app (use this to test)
pnpm dev        # vite only (frontend, no Tauri backend — rarely useful here)
pnpm build      # tsc + vite build (typecheck + bundle frontend)
pnpm package    # tauri build — produce distributable bundles
cargo check --manifest-path src-tauri/Cargo.toml   # typecheck Rust backend only
npx @biomejs/biome check --write .   # lint + format (also runs on pre-commit)
```

There are no tests. Verify changes by running `pnpm start` and exercising the UI.

## Architecture

### The two browser instances (key design point)

The backend manages **two separate browser instances**, both modeled by
`BrowserState` in [src-tauri/src/lib.rs](src-tauri/src/lib.rs), distinguished by
newtype wrappers registered as Tauri managed state:

- **`HeadlessBrowserState`** (`with_head: false`) — used by `get_task_parameters`
  to scrape the form's `<select>` options (dates, leaves, projects). Runs hidden.
- **`HeadedBrowserState`** (`with_head: true`) — used by `submit_task` so the user
  can see the pre-filled form and click submit themselves. Runs visible.

Each `BrowserState` holds `Mutex<Option<(Browser, Page)>>` — the browser is lazily
launched on first use via `get_page()` and reused afterward. Each browser's
Chromium user-data dir is a fixed path under the app's own cache dir
(`app_cache_dir()/profiles/{headed,headless}` — separate subdirs so the two never
contend for the same profile lock), wiped at the start of each launch. Using the
app cache dir rather than the shared system temp avoids macOS "access data from
other apps" prompts; wiping clears any stale `SingletonLock` from an unclean
shutdown so a leftover Chromium can't make the next launch hand off and exit.

`get_page()` validates the cached page before reusing it via `is_page_alive()`,
a real round-trip into the page's JS context (`page.evaluate("1")`, 2s timeout).
**Do not** probe with `page.url()`: chromiumoxide answers that from its locally
cached frame state without contacting Chromium, so it stays `Ok` even when the
session is dead (e.g. after the OS suspends the browser during a long idle) — a
false positive that strands the next real command on a ~30s CDP timeout. A
process-level check (`Browser::try_wait()`) is likewise insufficient: on macOS the
process lingers after its last window closes. Probe the live session, not the
cache or the process. When the probe fails the stale instance is force-killed
(`browser.kill()`) and a fresh one is launched and logged in.

### Browser login flow (`BrowserState::get_page`)

On first `get_page()` for an instance:
1. Read `phone`, `portal_url`, and `portal_credential` from `store.json`
   (all under the `account` key), failing fast — before Chromium is spent —
   if any is missing.
2. Launch Chromium (headless or headed), enable stealth mode.
3. Set a Basic-auth `Authorization` header from `portal_credential`
   (HTTP basic gate on the admin site).
4. Navigate to `portal_url`, type the phone into the login
   input, press Enter.
5. `wait_for_url` polls until the URL starts with `<portal_url>/member.php`,
   confirming login succeeded.

`wait_for_url` does a prefix match on the current URL (so query params or a
trailing slash appended by a redirect still count), and succeeds immediately
if the page is already on the target URL.

### Browser lifecycle / cleanup

**All browser instances must be terminated on app close.** This is handled in the
`RunEvent::Exit` handler in `run()`, which calls `.close()` on both states.
`close()` attempts a graceful shutdown (close page → close browser → `wait()`),
but bounds it with a 3s timeout and falls back to `browser.kill()` — if the user
already closed the window the connection is gone, so the graceful close can never
complete and `wait()` would otherwise block forever. The user-data dirs are *not*
deleted on close: they are fixed paths under the app cache dir, bounded to two,
and wiped at the start of the next launch (which also reclaims anything a
force-quit left behind). `close()` is also exposed via the `close_browsers`
command, which tears down **both** instances and is called from the frontend
when the account changes (so a new login happens with the new phone number —
a reused headed session would otherwise submit tasks as the previous member)
and when the window is refocused after ≥1h unfocused (`useResetWhenAway` —
see Frontend structure).
When adding new browser instances or long-lived resources, make sure they are
also torn down in the `Exit` handler.

### Window startup visibility (anti-flash handshake)

The main window is created hidden (`"visible": false` in
[src-tauri/tauri.conf.json](src-tauri/tauri.conf.json)) so it never appears
before the UI has rendered; the frontend reveals it — `ShowWindowOnMount` in
[src/main.tsx](src/main.tsx) calls `show()` + `setFocus()` on mount (needs
`core:window:allow-show` in capabilities). It must stay the **outermost**
component: parent effects run after child effects, so the theme class is
applied before the window becomes visible. Two backend pieces keep this
working — break either and the flash returns or the app looks dead:

- `tauri-plugin-window-state` is registered with
  `StateFlags::all() & !StateFlags::VISIBLE`. With the default flags it
  restores the previous session's visibility at window creation, re-showing
  the window before the frontend is ready — intermittently, since it depends
  on saved state.
- The single-instance callback calls `show()` before `set_focus()`: if the
  frontend ever fails to load (window stuck hidden), launching the app again
  reveals the window instead of silently focusing an invisible one.

### Tauri commands (the frontend ↔ backend boundary)

Defined in [src-tauri/src/lib.rs](src-tauri/src/lib.rs), registered in
`invoke_handler`:

- `get_task_parameters() -> TaskParameters` — headless scrape of form `<select>`
  options. Returns `{ dates, leaves, projects }`, each `Vec<SelectOption {label, value}>`.
- `submit_task(date, summary)` — headed; navigates the form, sets the date select,
  sets `default_project` and filters the project options to `project_list` (both
  read from the `preferences` key in `store.json`), and fills the comment textarea
  with `summary`. **Does not click submit** — the user does.
- `close_browsers()` — tears down both browser instances (called after account save,
  so neither session keeps the old login, and by the ≥1h-away reset in
  `use-reset-when-away.ts`).

Form field selectors on the portal (keep in sync if the portal changes):
`select#task_date`, `select#task_leave`, `select#task_project_id1`,
`textarea#task_comment1`.

### Frontend structure

- [src/App.tsx](src/App.tsx) — sidebar with `OpenMemberPageButton`,
  `RefreshDateListButton`, `FavoritesForm`, `PreferencesForm`, `AccountForm`;
  renders `DateList` once an account exists; mounts `useResetWhenAway`.
- [src/lib/use-reset-when-away.ts](src/lib/use-reset-when-away.ts) —
  `useResetWhenAway`: when the window regains focus after being unfocused
  ≥1h, calls `close_browsers` and, once teardown settles, reloads the
  webview. Order matters: a reload alone would not reset the backend
  `BrowserState`s — the next command after teardown launches and logs in
  fresh. `relaunch()` is a last-resort fallback used only when the
  `close_browsers` invoke itself fails (needs `process:allow-restart` in
  capabilities and `tauri_plugin_process` registered — both in place).
- [src/lib/use-update-check.ts](src/lib/use-update-check.ts) —
  `useUpdateCheck`: on launch (production only), asks the updater plugin for
  a newer release and, if found, shows a persistent toast whose action
  downloads, installs, and relaunches.
- [src/lib/store.ts](src/lib/store.ts) — the `LazyStore` handle plus the
  `Account`/`Preferences`/`TaskGroupType` types and `DEFAULT_PREFERENCES`.
  No client state library: account and preferences are read through react-query
  (`useAccount`/`usePreferences` in `queries.ts`).
- [src/lib/task-groups.ts](src/lib/task-groups.ts) — `TASK_GROUPS`: the four
  task groups (three Jira-queried plus local favorites, last), shared by
  `DateCard` and the preferences form.
- [src/components/account-form.tsx](src/components/account-form.tsx) — dialog to
  edit secrets (portal URL, portal credential, phone, Jira email, Jira API token); inputs strip all spaces. On
  save: writes to `store.json`, calls `close_browsers`, invalidates
  `task_parameters`. Opens automatically until the portal fields are configured (covers fresh installs and stores saved before those fields existed).
- [src/components/preferences-form.tsx](src/components/preferences-form.tsx) —
  dialog with `DefaultProjectSelect`, `ProjectListSelect`,
  `DefaultTaskGroupsSelect`, and `ThemeToggle`.
- [src/components/favorites-form.tsx](src/components/favorites-form.tsx) —
  star-icon dialog in the sidebar for the `favorites` list: add (rejects
  duplicates and blank text) and delete only, saved immediately via
  `useSaveFavoritesMutation`.
- [src/components/date-list.tsx](src/components/date-list.tsx) — runs
  `useTaskParameters`, renders a `DateCard` per non-empty date, paginated 5 at a
  time with a "Load more" button.
- [src/components/date-card.tsx](src/components/date-card.tsx) — per-date card.
  Runs three Jira queries (status-changed-by-me, created-by-me, my-open-sprint)
  plus `useFavorites` for the local favorites group, shows each as its own
  `TaskSelect` group (favorites render with `plainLabels`, wrapped in
  `favorite:`-prefixed issue-shaped objects so dedup/default-checked/override
  logic is reused unchanged). Groups in `default_task_groups`
  render first and their issues start checked; dedup by issue key runs in
  display order, so a duplicate lands in the first group on screen and defaults
  follow the *displayed* group. User toggles are kept as per-issue `overrides`
  on top of the defaults (only actually-changed issues are recorded). Selected
  favorites lead the `summaryText` as plain bullets, ahead of the Jira issues
  (grouped by status), shown/copied/submitted via the submit (`Play`) button →
  `useSubmitTaskMutation`.
- [src/lib/queries.ts](src/lib/queries.ts) — react-query options/hooks.
  `taskParametersOptions` wraps the `get_task_parameters` command;
  `jiraTasksQueryOptions` calls the Jira REST API directly; `preferencesOptions`
  merges the stored object over `DEFAULT_PREFERENCES` field-by-field;
  `favoritesOptions`/`useFavorites` read the `favorites` key (`?? []` covers
  stores saved before the key existed).
- [src/lib/mutations.ts](src/lib/mutations.ts) — `useSubmitTaskMutation`
  (invokes `submit_task`, optimistically removes the submitted date),
  `useSaveAccountMutation`, `useSavePreferencesMutation`, and
  `useSaveFavoritesMutation` (the latter two update the cache optimistically
  in `onMutate` — consumers compute the next preferences/favorites from the
  current value, so a late cache write would let rapid edits clobber each
  other).

### Account, preferences & favorites (`store.json`)

Persisted via the Tauri store plugin under three keys:

```ts
account:     { phone, email, api_token, portal_url, portal_credential }
preferences: { default_project, project_list, default_task_groups, autofill_summary, auto_submit, auto_close }
favorites:   string[]
```

`phone` authenticates into the admin portal; `portal_url` (portal base URL,
stored without a trailing slash) and `portal_credential` (`user:pass` for the
portal's HTTP basic gate) tell the backend where that portal is — all three
are read by the Rust side. `email` + `api_token` authenticate to Jira.
`default_project`/`project_list` and `auto_submit`/`auto_close` (both
default `false`) are also read by the Rust side in `submit_task`;
`default_task_groups` (which task groups start checked on a
date card, default `["status"]`) and `autofill_summary` (whether submit passes
the built summary or an empty string, default `true`; when `true`, Jira
fetching also disables the submit button) are frontend-only. `favorites` — free-form favorite
task texts, insertion-ordered, the text itself is the identity — is also
frontend-only: unlike `preferences`, the Rust side never reads it. The **same
`store.json` is read from both sides** — the frontend via `LazyStore`, the
backend via `app.store("store.json")` — so field names must stay in sync
between [src/lib/store.ts](src/lib/store.ts) and the Rust code. When adding a
`Preferences` field, give it a default in `DEFAULT_PREFERENCES`: the per-field
merge in `preferencesOptions` is what upgrades stores saved before the field
existed.

### Jira integration

[src/lib/queries.ts](src/lib/queries.ts) `jiraTasksQueryOptions` POSTs to
`https://living-insider.atlassian.net/rest/api/3/search/jql` using
`@tauri-apps/plugin-http` `fetch` (not browser `fetch` — needed to avoid CORS and
because the host is allowlisted in capabilities). Auth is Basic
`base64(email:api_token)`. `DateCard` runs three JQL queries per date (bounded
by `<date>` inclusive to `<date+1>` exclusive):

- status: `status CHANGED BY currentUser() DURING ("<date>", "<date+1>")`
- created: `creator = currentUser() AND created >= "<date>" AND created < "<date+1>"`
- sprint: `assignee = currentUser() AND created < "<date+1>" AND sprint in openSprints() AND statusCategory != Done`

Jira Cloud returns 200 with zero issues on bad credentials (anonymous
fallback); the auth failure is detected via the `x-seraph-loginreason` header.

`DateCard` formats the *selected* issues, grouped by `fields.status.name`, as
`[Status]\n• KEY: summary` blocks — this becomes the report comment. Issues
displayed under the "created" group (post-dedup) are relabeled (via `mutative`
`create` — the originals live in the react-query cache, see the immutability
convention below) to a synthetic "Created" status before grouping, so they land
in their own `[Created]` block, sorted alphabetically among the status blocks.

## CI/CD & releasing

- **CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)): PRs and
  pushes to `main` run two parallel jobs — `frontend` (Biome, `pnpm build`)
  and `rust` (`cargo check` with Tauri's Linux deps).
- **Releases** ([.github/workflows/release.yml](.github/workflows/release.yml)):
  pushing a `vX.Y.Z` tag builds macOS (Apple Silicon, app + dmg — `app`
  supplies the `.app.tar.gz` updater artifact) and Windows
  (NSIS) via `tauri-apps/tauri-action` and uploads installers, updater
  artifacts, and `latest.json` to a **draft** GitHub Release. A guard job
  fails the run if the tag doesn't match `version` in
  `src-tauri/tauri.conf.json`.
- **Release checklist:**
  1. `pnpm bump <X.Y.Z|major|minor|patch>`
     ([scripts/bump-version.mjs](scripts/bump-version.mjs)) — updates the
     version in `package.json`, `src-tauri/tauri.conf.json`, and
     `src-tauri/Cargo.toml` (+`Cargo.lock` via `cargo metadata`; the guard
     only enforces tauri.conf.json, the others are kept in sync for
     hygiene), then branches to `release/vX.Y.Z`, commits, pushes, and
     opens the prefilled PR page. Requires a clean, up-to-date `main`.
  2. Merge the bump PR, pull `main`, then `pnpm bump --tag` — verifies
     `main` is current and the tag is new, then tags `vX.Y.Z` and pushes
     it (this is what triggers the release build).
  3. When the draft release appears, verify its asset list first — `.dmg`,
     `.app.tar.gz`(+`.sig`), `-setup.exe`(+`.sig`), and a `latest.json`
     containing both `darwin-aarch64` and `windows-x86_64` entries (a
     missing platform means a bundling regression) — then write the notes
     and **Publish**. Publishing is what makes `releases/latest/download/latest.json` live —
     existing installs see the update on next launch.
- **Updater:** `tauri-plugin-updater` checks GitHub Releases on launch
  (`use-update-check.ts`, no-op in dev). Updater artifacts are signed with
  the key in the `TAURI_SIGNING_PRIVATE_KEY`(+`_PASSWORD`) repo secrets; the
  public key lives in `tauri.conf.json`. **Losing the private key means
  shipped apps can't verify future updates** — users would have to reinstall
  manually.
- **[install.sh](install.sh)** (repo root) is the macOS install one-liner
  (`curl | bash` from `raw.githubusercontent.com/.../main/install.sh`).
  curl sets no quarantine attribute, so unsigned builds installed this way
  never hit Gatekeeper's "damaged" dialog. Keep its asset-matching suffix
  (`.app.tar.gz`) in sync with what the release workflow uploads.
- Branch protection (GitHub settings, manual): `main` requires the
  `frontend` and `rust` checks.

## Conventions & gotchas

- **Path alias:** `@/` → `src/` (configured in both `tsconfig.json` and
  `vite.config.ts`). Both are used; keep imports consistent with nearby files.
- **Permissions:** Frontend HTTP and window APIs must be allowlisted in
  [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json).
  Adding a new external Jira host or a new window API requires editing it.
- **react-query defaults** ([src/main.tsx](src/main.tsx)): `staleTime: Infinity`,
  no refetch on window focus. Data is refreshed via explicit refetch buttons or
  cache invalidation, not automatically — the one exception is the ≥1h-away
  reset, which reloads the whole webview.
- **Never mutate objects that came out of the react-query cache.** Derived
  arrays (`filter`/`flatMap`/`map` results) are new, but their *elements* are
  still references into `query.data` — an in-place write goes straight into the
  cache, and with `staleTime: Infinity` the original value is unrecoverable
  until a manual refetch. Render-phase code (`useMemo` included) must stay
  pure. For a nested update, derive a modified copy with `mutative`'s
  `create(obj, draft => { ... })` (structural sharing, cache untouched) — see
  the `[Created]` relabel in `date-card.tsx`. Note `mutative` does **not**
  auto-freeze its output, so an accidental mutation won't throw at runtime;
  it just silently corrupts the cache.
- **`relaunch()` races `tauri-plugin-single-instance`.** Restart spawns the new
  process before the old one exits; if the new instance's single-instance check
  runs while the old is still shutting down, it defers to the dying instance
  and the app just quits. `useResetWhenAway` uses `relaunch()` only as a
  last-resort fallback (its trigger — the `close_browsers` invoke rejecting —
  is nearly unreachable); verify this combination before relying on it
  anywhere else.
- **`submit_task` builds JS by string interpolation.** `summary` is safely passed
  through `serde_json::to_string`, but `date`/`project` are interpolated raw into
  `evaluate(...)` — they come from the portal's own option values, so keep it that
  way and don't feed untrusted strings into those paths.
- **Hardcoded values** live in `lib.rs`: the login/form selectors only. They are
  portal-specific; update them if the portal's markup changes. The portal base
  URL and Basic-auth credential are *not* compiled in — they are user-supplied
  via the Account form (`account.portal_url` / `account.portal_credential` in
  `store.json`) and read per-use by `portal_url()` / `portal_credential()`.
- Biome enforces sorted Tailwind classes and organized imports; the pre-commit
  hook auto-fixes staged files.
