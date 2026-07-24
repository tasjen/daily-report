# CLAUDE.md

Repository guidance.

## Product

**Daily Report** is a Tauri 2 desktop app that automates daily work-report submissions to the LivingInsider admin portal (`portal.example.com/team`). It pulls each day's completed work from Jira and pre-fills the portal task form through browser automation; the user only clicks submit.

- The portal has no public API. The Rust backend drives a real Chromium instance with [chromiumoxide](https://github.com/mattsse/chromiumoxide).
- Jira has a REST API and is queried directly from the frontend.

## Stack

- **Backend:** Rust + Tauri 2, `chromiumoxide` (CDP browser automation), `tokio`.
- **Frontend:** React 19, TypeScript 7, Vite 8.
- **State/data:** `@tanstack/react-query` (server state and persisted-store front), `@tauri-apps/plugin-store` (secrets + preferences in `store.json`), `mutative` (immutable nested updates of cached objects).
- **HTTP:** `@tauri-apps/plugin-http` (frontend Jira calls; required to bypass browser CORS).
- **UI:** Tailwind CSS v4, shadcn-style components on `@base-ui/react`, `lucide-react`, `@formkit/auto-animate`.
- **Tooling:** Oxc — oxlint (lint, type-aware via `oxlint-tsgolint`) and oxfmt (format), lefthook (pre-commit), pnpm.

## Commands

```bash
pnpm start      # tauri dev — run the full desktop app (use this to test)
pnpm dev        # vite only (frontend, no Tauri backend — rarely useful here)
pnpm build      # tsc + vite build (typecheck + bundle frontend)
pnpm package    # tauri build — produce distributable bundles
cargo check --manifest-path src-tauri/Cargo.toml   # typecheck Rust backend only
pnpm lint:fix   # oxlint --type-aware --fix (also runs on pre-commit)
pnpm fmt        # oxfmt: format in place (also runs on pre-commit; fmt:check to verify)
pnpm test       # vitest run — frontend unit + component tests
pnpm test:watch # vitest watch mode
cargo test --manifest-path src-tauri/Cargo.toml    # Rust unit tests
pnpm e2e        # WebdriverIO smoke suite — fails on macOS (see Testing)
```

Unit tests cover extracted pure logic; UI behavior is still verified with `pnpm start` and exercising the app.

## Testing

- **Frontend:** Vitest 4 + jsdom + React Testing Library. [vitest.config.ts](vitest.config.ts) `mergeConfig`s [vite.config.ts](vite.config.ts), so the `@` alias, lingui macro transform, and react-compiler preset apply in tests. Tests are colocated `*.test.ts(x)` under `src/`; `globals` is off — import `describe`/`it`/`expect` from `"vitest"` explicitly (keeps `tsc -b` and type-aware oxlint working without tsconfig `types` churn).
- **Tauri mocking:** [src/test/tauri.ts](src/test/tauri.ts) `mockTauri(data, onInvoke?)` answers plugin-store IPC from in-memory data and delegates other commands; [src/test/setup.ts](src/test/setup.ts) runs RTL `cleanup()` + `clearMocks()` after each test. Importing `store.ts` in tests is safe: `LazyStore` does no IPC until first use.
- **Don't render components whose value comes from an uncached `use(promise)`** (e.g. `Version`): the promise recreates every render and never settles under RTL.
- **Rust:** `#[cfg(test)]` unit tests colocated in the module under test — `submission.rs` (planning + workflow), `browser_session.rs` (reuse, recovery, teardown), `navigation.rs` (URL matching + polling), `account.rs` (stored portal config), and `project_options.rs` (cache scope). `lib.rs` itself holds no tests — it is the Chromium wiring layer. Chromium itself stays untested: policy lives behind seams (`SubmissionPortal`, `BrowserHost`, the `current_url` closure, the `scrape` closure) that tests drive with fakes, while `lib.rs` holds the one real implementation of each. Async tests use `#[tokio::test]`, with `start_paused = true` where timing is asserted. Fakes record an ordered event log and assert on that, not on call counts — it catches ordering bugs (killing a stale browser *before* relaunching) that counters miss.
- **E2E:** WebdriverIO + tauri-driver smoke suite in [e2e/](e2e/), Linux/Windows only (no macOS tauri-driver), run by the separate non-required [e2e.yml](.github/workflows/e2e.yml) workflow on `main` pushes and manual dispatch. `e2e/tsconfig.json` is deliberately not referenced from the root tsconfig so pre-push `tsc -b` ignores it.

## Architecture

### Browser instances

The backend manages **two separate browser instances**, distinguished by newtype wrappers registered as Tauri managed state:

| State | Setting | Purpose |
|---|---|---|
| **`HeadlessBrowserState`** | `with_head: false` | Hidden; `get_task_parameters` scrapes form `<select>` options (dates, leaves, projects). |
| **`HeadedBrowserState`** | `with_head: true` | Visible; `submit_task` pre-fills the form for the user to submit. |

Both wrap `BrowserState`, an alias for `BrowserSession<ChromiumHost>`. The split keeps reuse/teardown policy testable without a real browser:

- **`BrowserSession<H>`** ([src-tauri/src/browser_session.rs](src-tauri/src/browser_session.rs)) holds `Mutex<Option<(H::Browser, H::Page)>>` and owns *all* the policy: lazy launch, liveness probing, stale replacement, and the bounded graceful close.
- **`BrowserHost`** is the system boundary — `launch` (launch + login), `is_page_alive`, `close`, `kill`, `label`. `ChromiumHost` in [src-tauri/src/lib.rs](src-tauri/src/lib.rs) is the only real implementation; it owns the `AppHandle` and `with_head`, so commands needing the handle go through `state.host().app`.

Put new policy in the session and new Chromium calls in the host. Policy added to `ChromiumHost` becomes untestable.

Each instance:

- Lazily launches through `get_page()` and reuses the browser.
- Uses a fixed Chromium user-data dir under the app cache: `app_cache_dir()/profiles/{headed,headless}`. Separate subdirs prevent profile-lock contention.
- Wipes its dir before each launch. Using the app cache instead of shared system temp avoids macOS “access data from other apps” prompts; wiping removes stale `SingletonLock` files after unclean shutdowns, preventing leftover Chromium from making a new launch hand off and exit.

**Every path that gives up a session removes it from the state before shutting it down.** A failed launch, a dead page, and a hung close all leave the state empty rather than holding a pair the next caller might reuse. `get_page` also holds the lock across the launch, so concurrent callers get one session instead of racing two browsers into the same profile dir.

**Project options are cached per login, not per process.** `ProjectOptionsCache` ([src-tauri/src/project_options.rs](src-tauri/src/project_options.rs)) scrapes the project `<select>` once and shares it; `close_browsers` clears it. That covers both moments the login identity can change — account save and the ≥1h-away reset — so a different member or portal never inherits the previous one's project list. The lock is held across the scrape, so concurrent first readers share one scrape; a failed scrape caches nothing and is retryable. Any new teardown path must clear it too.

Before reuse, `get_page()` calls the host's `is_page_alive()`, which performs a real JS-context round-trip: `page.evaluate("1")` with a 2s timeout.

- **Do not use `page.url()` as the probe.** chromiumoxide serves it from cached frame state without contacting Chromium, so it remains `Ok` after session death (for example, OS suspension during a long idle). This false positive strands the next real command on a ~30s CDP timeout.
- **Do not rely on `Browser::try_wait()`.** On macOS, the process can linger after its last window closes.
- Probe the live session, not cached state or the process. On failure, force-kill the stale instance with `browser.kill()`, then launch and log in again.

### Login flow: `BrowserState::get_page`

On an instance's first `get_page()`:

1. Read `phone`, `portal_url`, and `portal_credential` from the `account` key in `store.json` through `PortalAccountConfig::from_store_value` ([src-tauri/src/account.rs](src-tauri/src/account.rs)). All three are validated together, so if any is missing the launch fails before spending Chromium startup. Holding a `PortalAccountConfig` is proof login can be attempted — keep reading config through it rather than pulling fields out of the store ad hoc.
2. Launch Chromium, headed or headless, and enable stealth mode.
3. Set a Basic-auth `Authorization` header from `portal_credential` (the admin site's HTTP basic gate).
4. Navigate to `portal_url`, type the phone into the login input, and press Enter.
5. Poll with `wait_for_url` until the current URL starts with `<portal_url>/member.php`, confirming login.

`wait_for_url` matches the expected URL exactly, or extended at a `?`, `#`, or `/` boundary — so a redirect that appends query parameters, a fragment, or a trailing slash counts as arrival, while a differently-named sibling route (`/member.php-old`) does not. It succeeds immediately when the page already has the target URL. The rule lives in `UrlExpectation::matches` ([src-tauri/src/navigation.rs](src-tauri/src/navigation.rs)) and is shared by login and post-submit confirmation.

### Lifecycle and cleanup

**Terminate all browser instances on app close.**

- `run()` handles `RunEvent::Exit` by calling `.close()` on both managed states. It also kills an in-flight transient `verify_portal_login` browser, parked in `VerifyBrowserState` for this purpose.
- `BrowserSession::close()` attempts graceful shutdown through the host: close page → close browser → `wait()`. The session bounds it with `GRACEFUL_CLOSE_TIMEOUT` (3s), then falls back to `kill()`. If the user already closed the window, the connection is gone; graceful close cannot finish and `wait()` would otherwise block forever. Repeated closes and closing an empty session are both no-ops.
- Do **not** delete user-data dirs on close. The fixed app-cache paths are bounded to three and wiped on next launch, also reclaiming force-quit leftovers.
- The `close_browsers` command closes **both** instances. The frontend calls it:
  - after an account change, forcing login with the new phone; otherwise a reused headed session could submit as the previous member;
  - when focus returns after ≥1h unfocused via `useResetWhenAway` (see Frontend).
- When adding browser instances or long-lived resources, also tear them down in the `Exit` handler.

### Startup visibility: anti-flash handshake

The main window starts hidden via `"visible": false` in [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json). `ShowWindowOnMount` in [src/main.tsx](src/main.tsx) reveals it with `show()` + `setFocus()` on mount; this requires `core:window:allow-show` in capabilities.

- Keep `ShowWindowOnMount` the **outermost** component. Parent effects run after child effects, letting the theme class apply before visibility.
- Register `tauri-plugin-window-state` with `StateFlags::all() & !StateFlags::VISIBLE`. Default flags restore the prior session's visibility during window creation, intermittently showing the window before the frontend is ready, depending on saved state.
- In the single-instance callback, call `show()` before `set_focus()`. If the frontend fails to load and leaves the window hidden, relaunching the app must reveal it instead of focusing an invisible window.

Breaking either backend safeguard restores the flash or makes the app look dead.

### Tauri commands: frontend ↔ backend

Define these in [src-tauri/src/lib.rs](src-tauri/src/lib.rs) and register them in `invoke_handler`:

- **`get_task_parameters() -> TaskParameters`:** Headless scrape of form `<select>` options. Returns `{ dates, leaves, projects }`, each `Vec<SelectOption {label, value}>`.
- **`submit_task(date, entries)`:** Headed; navigates the form and sets the date select.
  - `entries` contains up to 3 `{ project, summary }` row pairs built by `DateCard` from `project_map`, largest bucket first.
  - Row *n* sets `task_project_id{n}` and fills `task_comment{n}`.
  - A `null` row-1 project falls back to `default_project`, read from the `preferences` key in `store.json`.
  - Every row's project options are filtered to `project_list` + `default_project` + entry projects.
  - **More than 3 entries is an error, not a truncation.** The form has 3 row pairs and `buildSubmission` already merges overflow into row 3, so a longer list means a caller bug; `SubmissionPlan::build` rejects it rather than silently shipping a report missing part of the day's work.
  - **Clicks submit only when `auto_submit` is on**; otherwise the user does. See the submission workflow below.
- **`close_browsers()`:** Tears down both instances and clears the cached project options. Called after account save to remove the old login and by the ≥1h-away reset in `use-reset-when-away.ts`.
- **`verify_portal_login(portal_url, portal_credential, phone)`:** Logs into the portal with a throwaway headless browser and its own `profiles/verify` dir. Uses the passed *candidate* values and **never** reads `store.json`. The Account form calls it before saving. Kill the browser after the check, pass or fail.

Keep portal selectors synchronized with portal markup:

- `select#task_date`
- `select#task_leave`
- Three project/comment pairs: `select#task_project_id1..3` / `textarea#task_comment1..3` (`lib.rs` prefix constants + row number)

### Submission workflow

`submit_task` splits into three seams so the rules are testable without Chromium ([src-tauri/src/submission.rs](src-tauri/src/submission.rs)):

- `SubmissionPlan::build(entries, preferences)` — the deterministic row/project rules above. Fallible: >3 rows is rejected.
- `SubmissionAutomation::from_preferences` — reads `auto_submit`/`auto_close`, both defaulting to `false` when the key or field is absent.
- `SubmissionWorkflow::execute(plan, automation, date, portal)` — prepare, then conditionally submit and close, against the `SubmissionPortal` trait. `ChromiumSubmissionPortal` in `lib.rs` is the only real implementation.

Order is load-bearing: prepare always runs; `auto_close` can never close anything unless `auto_submit` also submitted; and closing waits for positive confirmation first.

**Post-submit confirmation is `<portal_url>/task_report.php`**, not `/member.php`. The portal redirects there once a task is saved, so it is the signal `auto_close` waits on (10s bound). `/member.php` is the *login* confirmation only — do not conflate the two. If confirmation times out the browser stays open and the command errors, so the user never loses an unconfirmed submission.

### Frontend

- [src/App.tsx](src/App.tsx): Sidebar containing `OpenMemberPageButton`, `RefreshDateListButton`, `FavoritesForm`, `PreferencesForm`, and `AccountForm`; renders `DateList` after an account exists; mounts `useResetWhenAway`.
- [src/lib/use-reset-when-away.ts](src/lib/use-reset-when-away.ts): `useResetWhenAway` calls `close_browsers` when focus returns after ≥1h unfocused, waits for teardown, then reloads the webview. Preserve this order: reload alone does not reset backend `BrowserState`s; after teardown, the next command launches and logs in fresh. Use `relaunch()` only as a last resort when the `close_browsers` invoke fails; it requires `process:allow-restart` in capabilities and registered `tauri_plugin_process` (both present).
- [src/lib/use-update-check.ts](src/lib/use-update-check.ts): `useUpdateCheck` runs at launch in production only. If the updater finds a newer release, it shows a persistent toast whose action downloads, installs, and relaunches.
- [src/lib/store.ts](src/lib/store.ts): `LazyStore`, `Account`/`Preferences`/`TaskGroupType`, and `DEFAULT_PREFERENCES`. There is no client state library; react-query reads account and preferences through `useAccount`/`usePreferences` in `queries.ts`.
- [src/lib/task-groups.ts](src/lib/task-groups.ts): `TASK_GROUPS`, the four groups—three Jira-backed, then local favorites—shared by `DateCard` and the preferences form.
- [src/components/account-form.tsx](src/components/account-form.tsx): Secrets dialog for portal URL, portal credential, phone, Jira email, and Jira API token; inputs strip all spaces.
  - On save, `useVerifyAccountMutation` verifies candidate portal values via `verify_portal_login` and Jira via `/rest/api/3/myself`, in parallel.
  - On failure, an error box lists each failed check; “Save anyway” skips verification for offline/portal-down cases.
  - Only then write `store.json`, call `close_browsers`, and invalidate `task_parameters`.
  - Open automatically until portal fields are configured, covering fresh installs and stores predating those fields.
- [src/components/preferences-form.tsx](src/components/preferences-form.tsx): Dialog containing `DefaultProjectSelect`, `ProjectListSelect`, `ProjectMapForm`, `DefaultTaskGroupsSelect`, and `ThemeToggle`.
- [src/components/project-map-form.tsx](src/components/project-map-form.tsx): Add/delete editor for `project_map` (project key → portal project); normalizes keys to uppercase, rejects duplicates, and caps the map at 3 distinct portal projects because the form has 3 row pairs. “Project key” means a Jira issue-key prefix or a favorite's custom `project_key` tag.
- [src/components/favorites-form.tsx](src/components/favorites-form.tsx): Star-icon sidebar dialog for `favorites`; supports add and delete only and saves immediately through `useSaveFavoritesMutation`. Add rejects duplicate/blank text. An optional uppercase-normalized project key tags a favorite for `project_map` routing.
- [src/components/date-list.tsx](src/components/date-list.tsx): Runs `useTaskParameters`; renders one `DateCard` per non-empty date, 5 at a time, with “Load more.”
- [src/components/date-card.tsx](src/components/date-card.tsx): Per-date card.
  - Runs three Jira queries—status-changed-by-me, created-by-me, my-open-sprint—plus `useFavorites`; renders each as a `TaskSelect` group.
  - Favorites use `plainLabels` and `favorite:`-prefixed issue-shaped objects, reusing dedup, default-checked, and override logic unchanged.
  - Groups in `default_task_groups` render first and start checked. Dedup by issue key follows display order: duplicates land in the first visible group, and defaults follow the *displayed* group.
  - Store user toggles as per-issue `overrides` over defaults; record only actually changed issues.
  - Selected favorites lead `summaryText` as plain bullets, before status-grouped Jira issues; the preview shows/copies it.
  - The submit (`Play`) button calls `useSubmitTaskMutation` with `submitEntries` from `buildSubmission` (see `date-card-helpers.ts`): the same selection split into at most 3 rows through `project_map`.
    - Jira project key: part of `issue.key` before `-`; favorite project key: its `project_key` tag.
    - Bucket mapped tasks by portal project; favorites count toward bucket size. Order largest first, with each row's favorites leading its comment as plain bullets.
    - If `default_project` exists, put unmapped tasks in that bucket, joining its mapped bucket if present. Otherwise put them in row 1's summary and merge issues into its status grouping.
    - Merge overflow past 3 buckets into row 3. Overflow can come from a distinct default-project bucket joining 3 mapped buckets or a hand-edited store.
    - With no bucket, send one `{ project: null }` entry for backend defaulting. Do the same when `autofill_summary` is off because there is no text to split.
- [src/lib/date-card-helpers.ts](src/lib/date-card-helpers.ts): Pure, unit-tested `DateCard` logic — `buildSubmission` (summary text + submit-row bucketing, spec pinned by `date-card-helpers.test.ts`), `buildSummary`, `getDateRelation`, `getDateAfter`, and `FAVORITE_KEY_PREFIX`.
- [src/lib/queries.ts](src/lib/queries.ts): React-query options/hooks. `taskParametersOptions` wraps `get_task_parameters`; `jiraTasksQueryOptions` calls Jira REST directly; `preferencesOptions` merges stored values over `DEFAULT_PREFERENCES` field-by-field; `favoritesOptions`/`useFavorites` read `favorites` (`?? []` supports stores predating the key).
- [src/lib/mutations.ts](src/lib/mutations.ts): `useSubmitTaskMutation` invokes `submit_task` and optimistically removes the submitted date. Also defines `useSaveAccountMutation`, `useSavePreferencesMutation`, and `useSaveFavoritesMutation`. The latter two optimistically update cache in `onMutate`; consumers derive the next preferences/favorites from current values, preventing late cache writes from letting rapid edits clobber each other.

### Store schema and semantics

The Tauri store plugin persists three `store.json` keys:

```ts
account:     { phone, email, api_token, portal_url, portal_credential }
preferences: { default_project, project_list, project_map, default_task_groups, autofill_summary, auto_submit, auto_close }
favorites:   { text, project_key }[]
```

- **Account:**
  - `phone` authenticates to the admin portal.
  - `portal_url` is the portal base URL without a trailing slash. Rust re-trims defensively through `normalize_portal_url`, which also normalizes pre-save candidates in `verify_portal_login` so a value can't verify one way and behave another once saved.
  - `portal_credential` is `user:pass` for the portal's HTTP basic gate. Passed through **verbatim** — never trimmed or split on `:`, since any byte may be part of the password.
  - Rust reads all three portal fields, together, via `PortalAccountConfig`. All are required and validated up front; empty strings and wrongly typed values count as unconfigured, and the field order in `from_store_value` decides which message a half-configured store reports.
  - `email` + `api_token` authenticate to Jira.
- **Preferences:**
  - Rust reads `default_project`/`project_list` and `auto_submit`/`auto_close` (both default `false`) in `submit_task`.
  - Frontend-only `default_task_groups` controls initially checked date-card groups; default: `["status"]`.
  - Frontend-only `autofill_summary` controls whether submit sends the built summary or an empty string; default: `true`. When `true`, Jira fetching also disables submit.
  - Frontend-only `project_map` maps project key → portal project option id; default: `{}`; at most 3 distinct values. `DateCard` uses it to split submission into per-project rows.
- **Favorites:** Frontend-only, unlike `preferences`; Rust never reads it. Favorites are insertion-ordered free-form tasks whose `text` is identity. Optional `project_key` accepts a Jira key or custom label; null means none. It routes through `project_map` like a real issue. Pre-`project_key` favorites are plain strings; `favoritesOptions` normalizes them to objects on read.
- **Synchronization:** Frontend `LazyStore` and backend `app.store("store.json")` read the **same file**. Keep field names synchronized between [src/lib/store.ts](src/lib/store.ts) and Rust. For every new `Preferences` field, add a `DEFAULT_PREFERENCES` default; `preferencesOptions`' per-field merge upgrades older stores.

### Jira integration

[src/lib/queries.ts](src/lib/queries.ts) `jiraTasksQueryOptions` POSTs to `https://living-insider.atlassian.net/rest/api/3/search/jql` using `@tauri-apps/plugin-http` `fetch`, not browser `fetch`; this bypasses CORS and uses the capability-allowlisted host. Authentication is Basic `base64(email:api_token)`.

`DateCard` runs three JQL queries per date, bounded by `<date>` inclusive and `<date+1>` exclusive:

- status: `status CHANGED BY currentUser() DURING ("<date>", "<date+1>")`
- created: `creator = currentUser() AND created >= "<date>" AND created < "<date+1>"`
- sprint: `assignee = currentUser() AND created < "<date+1>" AND sprint in openSprints() AND statusCategory != Done`

Jira Cloud can return 200 with zero issues for bad credentials due to anonymous fallback. Detect authentication failure through the `x-seraph-loginreason` header.

`buildSubmission` in [src/lib/date-card-helpers.ts](src/lib/date-card-helpers.ts) formats selected issues, grouped by `fields.status.name`, as `[Status]\n• KEY: summary` blocks for the report comment. After dedup, it relabels issues displayed in “created” to synthetic status “Created” before grouping, placing them in their own `[Created]` block sorted alphabetically among status blocks. It uses `mutative` `create`; the originals remain in react-query cache (see immutability below).

## CI/CD and releases

### CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on PRs and `main` pushes with two parallel required jobs:

- `frontend`: oxlint + oxfmt check + `pnpm test` + `pnpm build` on Ubuntu.
- `rust`: `cargo check` + `cargo test` on macOS, avoiding Linux-only Tauri system dependencies.

The E2E smoke suite runs separately in [e2e.yml](.github/workflows/e2e.yml) (non-required; `main` pushes + manual dispatch) — a full Linux Tauri debug build is too slow to gate PRs.

Each job uses `dorny/paths-filter` and `if:`-guards toolchain/setup/check steps based on relevant paths. Irrelevant changes still complete required checks without running the work. Preserve these constraints:

- `permissions:` **must** grant `pull-requests: read`; on PR events, the filter reads changed files from the API, which the explicit permissions block otherwise denies.
- Exclude `graphify-out` with extglob `!(graphify-out)/**/*.{…}`, **not** a leading-`!` line. paths-filter matches when **any** pattern matches, so a negation line matches nearly everything. This matters because `graphify update .` commits `graphify-out/*.json` beside Rust-only changes.
- The `frontend` filter must cover `src-tauri` JSON (`tauri.conf*.json`, `capabilities/*.json`) because oxfmt formats it. Keep the filter synchronized with `ignorePatterns` in `.oxfmtrc.json`/`.oxlintrc.json`; excluding all `src-tauri` would allow config formatting violations onto `main`.
- Do not add `fetch-depth: 0`; paths-filter deepens the shallow clone itself.

### Releases

[.github/workflows/release.yml](.github/workflows/release.yml):

- A `vX.Y.Z` tag builds macOS Apple Silicon (`app` + dmg; `app` supplies the `.app.tar.gz` updater artifact) and Windows NSIS through `tauri-apps/tauri-action`.
- It uploads installers, updater artifacts, and `latest.json` to a **draft** GitHub Release.
- A guard job fails when the tag differs from `version` in `src-tauri/tauri.conf.json`.

Release checklist:

1. Run `pnpm bump <X.Y.Z|major|minor|patch>` ([scripts/bump-version.mjs](scripts/bump-version.mjs)). It updates `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `Cargo.lock` through `cargo metadata`; only tauri.conf.json is guard-enforced, while the others remain synchronized for hygiene. It then creates `release/vX.Y.Z`, commits, pushes, and opens the prefilled PR page. Requires clean, up-to-date `main`.
2. Merge the bump PR, pull `main`, then run `pnpm bump --tag`. It verifies current `main` and a new tag, creates `vX.Y.Z`, and pushes it, triggering the release build.
3. When the draft appears, first verify `.dmg`, `.app.tar.gz` + `.sig`, `-setup.exe` + `.sig`, and `latest.json` with both `darwin-aarch64` and `windows-x86_64`. A missing platform means a bundling regression. Then write notes and **Publish**. Publication makes `releases/latest/download/latest.json` live; installed apps see the update at next launch.

Additional release rules:

- **Updater:** `tauri-plugin-updater` checks GitHub Releases at launch through `use-update-check.ts`; no-op in dev. Sign updater artifacts with the key in the `TAURI_SIGNING_PRIVATE_KEY`(+`_PASSWORD`) repo secrets; the public key is in `tauri.conf.json`. **Losing the private key prevents shipped apps from verifying future updates; users must reinstall manually.**
- **[install.sh](install.sh):** macOS repo-root install one-liner using `curl | bash` from `raw.githubusercontent.com/.../main/install.sh`. curl sets no quarantine attribute, so unsigned builds installed this way avoid Gatekeeper's “damaged” dialog. Keep its `.app.tar.gz` asset suffix synchronized with release uploads.
- **Branch protection:** Manually configure GitHub so `main` requires `frontend` and `rust`.

## Conventions and constraints

- **Path alias:** `@/` → `src/`, configured in `tsconfig.json` and `vite.config.ts`. Both forms are used; match nearby imports.
- **Permissions:** Allowlist frontend HTTP and window APIs in [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json). Edit it for every new external Jira host or window API.
- **react-query defaults:** [src/main.tsx](src/main.tsx) sets `staleTime: Infinity` and disables refetch on focus. Refresh only through explicit buttons or cache invalidation, except the ≥1h-away reset, which reloads the webview.
- **Never mutate react-query cache objects.**
  - Derived arrays from `filter`/`flatMap`/`map` are new; their elements still reference `query.data`. In-place writes mutate cache, and `staleTime: Infinity` makes the original unrecoverable until manual refetch.
  - Keep render-phase code, including `useMemo`, pure.
  - For nested updates, use `mutative`'s `create(obj, draft => { ... })` to derive a structurally shared copy without touching cache; see the `[Created]` relabel in `date-card-helpers.ts`.
  - `mutative` does **not** auto-freeze output. Accidental mutation does not throw; it silently corrupts cache.
- **`relaunch()` races `tauri-plugin-single-instance`.** Restart starts the new process before the old exits. If its single-instance check reaches the shutting-down old process, it defers to that dying instance and the app quits. `useResetWhenAway` uses `relaunch()` only as a last resort when the `close_browsers` invoke rejects—an almost unreachable trigger. Verify this combination before using it elsewhere.
- **Every value interpolated into `evaluate(...)` goes through `serde_json::to_string`.** That covers summaries, projects, dates, the login phone, and the selectors themselves (several contain single quotes, so hand-wrapping them in `'...'` breaks the JS). No exceptions: the phone is user-supplied and validated only as non-empty, so a raw apostrophe would break the script and a crafted value would inject into the portal page. When adding a new `evaluate` call, escape the literal even if the value looks trusted — Rust enforces no phone or date format, and the trust boundary should not be load-bearing.
- **Hardcoded values:** `lib.rs` contains only login/form selectors. They are portal-specific; update them when portal markup changes. Portal base URL and Basic-auth credentials are **not** compiled in: users supply `account.portal_url` / `account.portal_credential` through the Account form in `store.json`; Rust reads them per use with `portal_url()` / `portal_credential()`.
- **Formatting:** oxfmt enforces sorted Tailwind classes (`sortTailwindcss`, reading the v4 stylesheet `src/App.css`) and sorted imports (`sortImports`); the pre-commit hook auto-fixes staged files. Linting needs `--type-aware` (wired into `pnpm lint`) or `typescript/no-floating-promises` silently stops running.
- **Never switch git branches without asking.** Do not `git checkout`/`git switch` to another branch, create a new branch, or pull `main` mid-session unless the user has explicitly approved it first — even when a merged PR makes moving to a fresh branch seem like the obvious next step. The user coordinates branch state outside the session; unannounced switches cause divergence and merge conflicts.

## graphify

The project knowledge graph at `graphify-out/` contains god nodes, community structure, and cross-file relationships.

- For codebase questions, first run `graphify query "<question>"` when `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return scoped subgraphs, usually much smaller than `GRAPH_REPORT.md` or raw grep output.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain lacks enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
