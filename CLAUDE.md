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
- **State/data:** `zustand` (global account), `@tanstack/react-query` (server
  state), `@tauri-apps/plugin-store` (persisted secrets in `store.json`).
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
1. Launch Chromium (headless or headed), enable stealth mode.
2. Set a Basic-auth `Authorization` header (HTTP basic gate on the admin site).
3. Navigate to `/team`, read `phone` from `store.json`, type it into the login
   input, press Enter.
4. `wait_for_url` polls until the URL changes to contain `/team/member.php`,
   confirming login succeeded.

`wait_for_url` compares against the *initial* URL and requires a change — it will
not match if already on the target URL, so navigate away before relying on it.

### Browser lifecycle / cleanup

**All browser instances must be terminated on app close.** This is handled in the
`RunEvent::Exit` handler in `run()`, which calls `.close()` on both states.
`close()` attempts a graceful shutdown (close page → close browser → `wait()`),
but bounds it with a 3s timeout and falls back to `browser.kill()` — if the user
already closed the window the connection is gone, so the graceful close can never
complete and `wait()` would otherwise block forever. The user-data dirs are *not*
deleted on close: they are fixed paths under the app cache dir, bounded to two,
and wiped at the start of the next launch (which also reclaims anything a
force-quit left behind). `close()` is also exposed via the `close_headless_browser`
command, called from the frontend when settings change (so a new login happens
with the new phone number). When adding new browser instances or long-lived
resources, make sure they are also torn down in the `Exit` handler.

### Tauri commands (the frontend ↔ backend boundary)

Defined in [src-tauri/src/lib.rs](src-tauri/src/lib.rs), registered in
`invoke_handler`:

- `get_task_parameters() -> TaskParameters` — headless scrape of form `<select>`
  options. Returns `{ dates, leaves, projects }`, each `Vec<SelectOption {label, value}>`.
- `submit_task(date, summary)` — headed; navigates the form, sets the date select,
  sets `default_project` (read from `store.json`) if configured, and fills the
  comment textarea with `summary`. **Does not click submit** — the user does.
- `close_headless_browser()` — tears down the headless browser (called after account save).

Form field selectors on the portal (keep in sync if the portal changes):
`select#task_date`, `select#task_leave`, `select#task_project_id1`,
`textarea#task_comment1`.

### Frontend structure

- [src/App.tsx](src/App.tsx) — loads `account` from the store on mount; shows
  `AccountForm` always and `DateList` once account exist.
- [src/store.ts](src/store.ts) — zustand `useGlobalState`: holds the `LazyStore`
  handle and the `account` object. `account` is `undefined` while loading,
  `null` if unset, or the object once configured.
- [src/AccountForm.tsx](src/AccountForm.tsx) — dialog to edit secrets (phone,
  Jira email, Jira API token, default project). On save: writes to `store.json`,
  calls `close_headless_browser`, invalidates `task_parameters`. Opens automatically when
  no account exist.
- [src/DateList.tsx](src/DateList.tsx) — runs `useTaskParameters`, renders one
  `DateCard` per date (first 20, non-empty values).
- [src/DateCard.tsx](src/DateCard.tsx) — per-date card. Queries Jira for that
  date, groups issues by status into the `summaryText` shown/copied/submitted,
  and has the submit (`Play`) button → `useSubmitTaskMutation`.
- [src/lib/queries.ts](src/lib/queries.ts) — react-query options/hooks.
  `taskParametersOptions` wraps the `get_task_parameters` command; `jiraTasksOptions`
  calls the Jira REST API directly.
- [src/lib/mutations.ts](src/lib/mutations.ts) — `useSubmitTaskMutation`: invokes
  `submit_task`, refocuses the window, and optimistically removes the submitted
  date from the cached `task_parameters` list.

### Account / secrets (`store.json`)

Persisted via the Tauri store plugin under the key `account`:

```ts
{ phone, email, api_token, default_project }
```

`phone` authenticates into the admin portal; `email` + `api_token` authenticate
to Jira. The **same `store.json` is read from both sides** — the frontend via
`LazyStore`, the backend via `app.store("store.json")` — so field names must stay
in sync between [src/store.ts](src/store.ts) and the Rust code.

### Jira integration

[src/lib/queries.ts](src/lib/queries.ts) `jiraTasksOptions` POSTs to
`https://living-insider.atlassian.net/rest/api/3/search/jql` using
`@tauri-apps/plugin-http` `fetch` (not browser `fetch` — needed to avoid CORS and
because the host is allowlisted in capabilities). Auth is Basic
`base64(email:api_token)`. The JQL finds issues whose status was changed by the
current user during the given date:
`status CHANGED BY currentUser() DURING ("<date> 00:00", "<date> 23:59")`.

`DateCard` groups the returned issues by `fields.status.name` and formats them as
`[Status]\nKEY: summary` blocks — this becomes the report comment.

## Conventions & gotchas

- **Path alias:** `@/` → `src/` (configured in both `tsconfig.json` and
  `vite.config.ts`). Both are used; keep imports consistent with nearby files.
- **Permissions:** Frontend HTTP and window APIs must be allowlisted in
  [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json).
  Adding a new external Jira host or a new window API requires editing it.
- **react-query defaults** ([src/main.tsx](src/main.tsx)): `staleTime: Infinity`,
  no refetch on window focus. Data is refreshed via explicit refetch buttons or
  cache invalidation, not automatically.
- **`submit_task` builds JS by string interpolation.** `summary` is safely passed
  through `serde_json::to_string`, but `date`/`project` are interpolated raw into
  `evaluate(...)` — they come from the portal's own option values, so keep it that
  way and don't feed untrusted strings into those paths.
- **Hardcoded values** live in `lib.rs`: the admin URL, the Basic-auth credential,
  and the login selectors. These are portal-specific; update here if the portal
  changes.
- Biome enforces sorted Tailwind classes and organized imports; the pre-commit
  hook auto-fixes staged files.
