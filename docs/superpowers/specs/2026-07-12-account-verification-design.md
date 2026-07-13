# Account verification on save — design

**Date:** 2026-07-12
**Status:** Approved

## Goal

When the user submits the Account form, verify the credentials actually work
before writing them to `store.json`:

- **Portal fields** (`portal_url`, `portal_credential`, `phone`) — verified by
  performing a real login in a throwaway headless browser, since the portal
  has no API and the phone number can only be validated by logging in.
- **Jira fields** (`email`, `api_token`) — verified with a lightweight Jira
  REST call.

On failure the save is blocked and the errors are shown in the dialog, but a
**"Save anyway"** action lets the user persist unverified values (covers
offline use or a temporarily down portal).

## Non-goals

- No verification anywhere other than Account form save (no startup check, no
  periodic re-check).
- No reuse of the verification browser session for later commands (rejected
  as approach C: faster saves, but more state plumbing for a rare operation).
- No cancel button for an in-flight verification; closing the dialog simply
  discards the result.

## Backend (Rust, `src-tauri/src/lib.rs`)

### New command

```rust
#[tauri::command]
async fn verify_portal_login(
    state: tauri::State<'_, VerifyBrowserState>,
    portal_url: String,
    portal_credential: String,
    phone: String,
) -> Result<(), AppError>
```

Registered in `invoke_handler`. Takes the **candidate** values as arguments —
it never reads `store.json`, so nothing persists until verification passes.

### Shared login helper

The login sequence currently inside `BrowserState::launch_and_login`
(wipe profile dir → launch Chromium → stealth mode → Basic-auth header →
`goto` portal → type phone into `LOGIN_INPUT_SELECTOR`, submit form →
`wait_for_url(<base_url>/member.php, 5s)`) is extracted into a free function:

```rust
async fn launch_and_login_with(
    user_data_dir: &std::path::Path,
    with_head: bool,
    phone: &str,
    base_url: &str,
    credential: &str,
) -> Result<(Browser, Page), AppError>
```

`BrowserState::launch_and_login` becomes "read config from store, call
helper"; `verify_portal_login` calls the same helper with the candidate
values. One login implementation, two callers — they cannot drift when the
portal changes. Behavior of the existing launch path is unchanged.

### Isolation & lifecycle

- The verify browser uses its own profile dir
  (`app_cache_dir()/profiles/verify`), so it never contends with the real
  headless instance's profile lock — a verify can run even while a scrape is
  in flight. The dir is wiped at the start of each launch by the shared
  helper, same convention as the other two profiles.
- The browser is throwaway: after the check (pass or fail) it is
  `browser.kill()`ed. No graceful-close ceremony — there is nothing to
  preserve.
- **Exit-handler invariant** (per CLAUDE.md: all browser instances must be
  terminated on app close): the verify browser is parked in a managed state
  for the duration of the check —

  ```rust
  struct VerifyBrowserState(Mutex<Option<Browser>>);
  ```

  The command stores the browser there while the login check runs, then
  kills and clears it. The `RunEvent::Exit` handler also kills it if present
  (covers app exit mid-verify). The `Mutex` doubles as serialization: two
  concurrent verify calls queue rather than fight over the profile dir.

### Errors

Login failure reuses the existing message mapping:
`"…\nWrong phone number, portal URL, or portal credential — or the portal
was slow to respond"`. The 5s `wait_for_url` bound already caps the
slow-portal case; no additional overall timeout is added (consistent with
the existing launch path).

## Frontend

### Jira check (`src/lib/queries.ts`)

```ts
export async function verifyJiraCredentials(email: string, apiToken: string): Promise<void>
```

Lives in `queries.ts` next to `jiraTasksQueryOptions` so the two share the
Jira domain constant and error-detection semantics. It calls
`GET https://living-insider.atlassian.net/rest/api/3/myself` via
`@tauri-apps/plugin-http` `fetch` with
`Authorization: Basic base64(email:api_token)`. The host is already
allowlisted in `capabilities/default.json` — no capability changes.

Failure detection mirrors `jiraTasksQueryOptions`:

1. `x-seraph-loginreason` header present and ≠ `OK` → auth failure
   (`"Jira authentication failed (<reason>) — check your Jira email and API
   token"`).
2. Otherwise `!res.ok` → generic request failure with status.

### Orchestration (`src/lib/mutations.ts`)

```ts
useVerifyAccountMutation()
```

Takes the candidate `Account`, runs in parallel via `Promise.allSettled`:

- `invoke("verify_portal_login", { portalUrl, portalCredential, phone })`
- `verifyJiraCredentials(email, api_token)`

On any failure it throws a `VerifyAccountError extends Error` carrying
`failures: { portal?: string; jira?: string }` (only the checks that failed),
so the UI can label each line. No react-query cache involvement — the
mutation is used purely for `isPending` / error state.
`useSaveAccountMutation` is untouched.

### `AccountForm` flow (`src/components/account-form.tsx`)

1. Zod validation passes (unchanged) → `portal_url` trailing-slash
   normalization (unchanged) → run the verify mutation. While pending the
   Save button is disabled and reads **"Verifying…"**; the dialog stays open.
2. **Both checks pass** → existing `saveAccount.mutate(...)` →
   `setOpen(false)`. Everything downstream (close_browsers, task-parameters
   invalidation) is untouched.
3. **Any check fails** → dialog stays open; an **error box** renders above
   the footer listing each failed check on its own line, labeled:
   - `Portal: <message>`
   - `Jira: <message>`

   A **"Save anyway"** button appears alongside Save; it calls
   `saveAccount.mutate` directly, skipping verification.

### Error-state lifecycle

- The verification error (and the "Save anyway" button) clears when the user
  resubmits and when the dialog reopens (alongside the existing `form.reset`
  in `handleOpenChange`).
- Closing the dialog mid-verify is allowed; a late result is discarded (the
  error state is reset on next open).

## Edge cases

- **Offline / portal down:** both checks fail, both lines shown, Save anyway
  available — the user is never locked out of changing their account.
- **Double submit:** prevented by the disabled Save button while verifying.
- **Verify during an active scrape:** safe — separate profile dir, separate
  browser process.
- **App exit mid-verify:** the Exit handler kills the parked verify browser.

## Testing

There are no automated tests in this repo (per CLAUDE.md). Verify manually
via `pnpm start`:

1. Correct values → "Verifying…" → dialog closes, account saved, date list
   loads.
2. Wrong phone → portal error line shown, save blocked, Save anyway works.
3. Wrong portal credential or URL → portal error line shown.
4. Wrong Jira token → Jira error line shown; portal check still passes.
5. Both wrong → both lines shown.
6. Network off → both lines shown, Save anyway persists the values.
7. `cargo check` and `pnpm build` pass.
