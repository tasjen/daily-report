# Account Verification on Save — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user submits the Account form, verify the portal fields (real headless-browser login) and the Jira fields (REST call) in parallel before anything is written to `store.json`, with a "Save anyway" escape hatch on failure.

**Architecture:** A new backend command `verify_portal_login` takes the *candidate* portal values as arguments and performs the same login sequence as the existing browser launch path (extracted into shared helpers) in a throwaway headless Chromium with its own profile dir. The frontend runs it in parallel with a cheap Jira `/myself` check via a new `useVerifyAccountMutation`; `AccountForm` only calls the existing save mutation when both pass, and otherwise shows a labeled error box plus a "Save anyway" button.

**Tech Stack:** Rust + Tauri 2 + chromiumoxide (backend), React 19 + TypeScript + @tanstack/react-query + @tauri-apps/plugin-http (frontend).

**Spec:** `docs/superpowers/specs/2026-07-12-account-verification-design.md`

## Global Constraints

- **No automated tests exist in this repo** (per CLAUDE.md). TDD steps are replaced by: `cargo check --manifest-path src-tauri/Cargo.toml` for Rust, `pnpm build` for TypeScript, and manual verification via `pnpm start` (Task 6).
- Lint/format: `npx @biomejs/biome check --write .` — the lefthook pre-commit hook also auto-fixes staged files (sorted Tailwind classes, organized imports). If a commit's content differs from what you wrote because of this, that is expected.
- **Nothing may write `store.json` except the existing `useSaveAccountMutation`.** The verify paths take candidate values as plain arguments.
- Portal login failure message, verbatim (existing copy, reused): the underlying error followed by `\nWrong phone number, portal URL, or portal credential — or the portal was slow to respond`.
- Jira auth failure message, verbatim (existing copy, mirrored): `Jira authentication failed (<reason>) — check your Jira email and API token`.
- Tauri v2 marshals invoke arguments camelCase (JS) ↔ snake_case (Rust): JS `portalUrl` arrives as Rust `portal_url`.
- CLAUDE.md invariant: **every browser instance must be terminated on app close** — the verify browser must be reachable from the `RunEvent::Exit` handler.
- Commit style: short imperative subject (match repo history, e.g. "Read portal URL and credential from store.json instead of constants"), body optional, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- All file paths below are relative to the repo root.

---

### Task 1: Extract shared browser-launch and portal-login helpers (backend refactor, no behavior change)

**Files:**
- Modify: `src-tauri/src/lib.rs` (the `BrowserState::launch_and_login` method, currently lines 178–248)

**Interfaces:**
- Consumes: existing `AppError`, `wait_for_url`, `LOGIN_INPUT_SELECTOR`, chromiumoxide imports — all already in `lib.rs`.
- Produces (Task 2 relies on these exact signatures):
  - `async fn launch_browser(user_data_dir: &std::path::Path, with_head: bool, label: &str) -> Result<(Browser, Page), AppError>`
  - `async fn login_to_portal(page: &Page, phone: &str, base_url: &str, credential: &str, label: &str) -> Result<(), AppError>`

**Why two helpers instead of the spec's single `launch_and_login_with`:** the split lets Task 2 park the `Browser` in the managed verify state *between* launch and login, so the app's Exit handler can kill it during the longest phase of the check (the login wait, up to 5s) — a tighter version of the spec's exit-handler invariant. Observable behavior is identical.

- [ ] **Step 1: Add the two free functions**

Place them directly below the `impl BrowserState { ... }` block, next to the other free functions (`account_str_field` etc.). The bodies are the existing code from `launch_and_login`, verbatim, with `self.label()` replaced by the `label` parameter:

```rust
/// Launches a fresh Chromium instance from a clean profile at `user_data_dir`.
/// `label` is used for log lines only. Shared by `BrowserState::launch_and_login`
/// and `verify_portal_login`.
async fn launch_browser(
    user_data_dir: &std::path::Path,
    with_head: bool,
    label: &str,
) -> Result<(Browser, Page), AppError> {
    // Start each launch from a clean profile in our own cache dir. Wiping
    // also clears any stale `SingletonLock` a previous unclean shutdown left
    // behind, so a leftover Chromium can't make this launch hand off and exit.
    log::info!("launching {label} browser");
    let _ = std::fs::remove_dir_all(user_data_dir);
    std::fs::create_dir_all(user_data_dir)?;
    let mut config = BrowserConfig::builder()
        .user_data_dir(user_data_dir)
        .incognito()
        .viewport(None);
    if with_head {
        config = config.with_head();
    }
    let (browser, mut handler) = Browser::launch(config.build()?).await?;
    tokio::spawn(async move { while handler.next().await.is_some() {} });
    let page = browser.new_page("about:blank").await?;
    Ok((browser, page))
}

/// Logs `page` into the admin portal: Basic-auth header, navigate to
/// `base_url`, type the phone into the login input, confirm arrival at
/// member.php. Shared by `BrowserState::launch_and_login` (values from
/// `store.json`) and `verify_portal_login` (candidate values from the
/// Account form), so the login sequence can't drift between the two.
async fn login_to_portal(
    page: &Page,
    phone: &str,
    base_url: &str,
    credential: &str,
    label: &str,
) -> Result<(), AppError> {
    page.enable_stealth_mode().await?;
    let token = STANDARD.encode(credential);
    page.execute(SetExtraHttpHeadersParams::new(Headers::new(
        serde_json::json!({ "Authorization": format!("Basic {}", token) }),
    )))
    .await?;
    page.goto(base_url).await?;

    // Build the JS via `serde_json::to_string` so the selector is
    // properly quoted/escaped. The selector itself contains single quotes
    // (`input[type='text']`), so hand-wrapping it in `'...'` breaks the JS.
    let selector_js = serde_json::to_string(LOGIN_INPUT_SELECTOR)?;
    page.evaluate(format!(
        "
            const phoneInput = document.querySelector({selector_js});
            phoneInput.value = '{phone}';
            phoneInput.form.submit();
        "
    ))
    .await?;

    wait_for_url(page, &format!("{base_url}/member.php"), 5_000)
        .await
        .map_err(|e| {
            log::warn!("{label} browser login failed: {e}");
            AppError::from(format!(
                "{e}\nWrong phone number, portal URL, or portal credential — or the portal was slow to respond"
            ))
        })?;
    log::info!("{label} browser logged into portal");
    Ok(())
}
```

- [ ] **Step 2: Slim `BrowserState::launch_and_login` down to config-read + helper calls**

Replace the entire method body (keep the doc comment and the initial-blank-tab cleanup, which is headed-window cosmetics and not part of the shared sequence):

```rust
    /// Launches a fresh Chromium instance and logs into the admin portal.
    async fn launch_and_login(&self) -> Result<(Browser, Page), AppError> {
        // Read the config first so a missing value fails before we spend the
        // cost of launching a browser.
        let phone = self.phone()?;
        let base_url = portal_url(&self.app)?;
        let credential = portal_credential(&self.app)?;

        let (browser, page) =
            launch_browser(&self.user_data_dir()?, self.with_head, self.label()).await?;
        login_to_portal(&page, &phone, &base_url, &credential, self.label()).await?;

        // Chromium starts with an initial blank tab in addition to the page we
        // create; close it after login so the headed window doesn't show a
        // stray empty tab. Best-effort: login already succeeded, so a cleanup
        // failure shouldn't fail the launch.
        if let Ok(pages) = browser.pages().await {
            for p in pages {
                if p.target_id() != page.target_id() {
                    let _ = p.close().await;
                }
            }
        }

        Ok((browser, page))
    }
```

- [ ] **Step 3: Typecheck the backend**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: no errors (warnings-free; the helpers are already referenced by `launch_and_login` so no dead-code warnings).

- [ ] **Step 4: Smoke-test that the app still logs in**

Run `pnpm start`, wait for the date list to load (this exercises the headless launch + login path end to end). Quit the app.
Expected: date list appears exactly as before the refactor.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "Extract shared browser launch and portal login helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `VerifyBrowserState` + `verify_portal_login` command

**Files:**
- Modify: `src-tauri/src/lib.rs` (new struct near the other state structs; new command near the other commands; `setup` closure; `invoke_handler` list; `RunEvent::Exit` handler)

**Interfaces:**
- Consumes: `launch_browser` and `login_to_portal` from Task 1 (exact signatures listed there).
- Produces (Task 4 relies on this): Tauri command `verify_portal_login` invocable from JS as `invoke("verify_portal_login", { portalUrl: string, portalCredential: string, phone: string })`, resolving to `void` on success and rejecting with the login-failure message string otherwise.

- [ ] **Step 1: Add the managed state struct**

Below the `impl_browser_state_deref!` invocations (i.e., after line 90 of the pre-Task-1 file):

```rust
/// Holds the throwaway browser used by `verify_portal_login` while a check is
/// in flight, so the `RunEvent::Exit` handler can kill it if the app closes
/// mid-verify (invariant: every browser instance must be terminated on app
/// close). The `Mutex` also serializes concurrent verifies, which share one
/// profile dir.
struct VerifyBrowserState(Mutex<Option<Browser>>);
```

- [ ] **Step 2: Add the command**

Place it next to `close_browsers`:

```rust
/// Verifies the given portal values by performing a real login in a throwaway
/// headless browser. Takes the *candidate* values as arguments — this never
/// reads `store.json` — so nothing persists unless the frontend decides to
/// save after this succeeds. Pass or fail, the browser is killed before
/// returning; it exists only for the duration of the check.
#[tauri::command]
async fn verify_portal_login(
    app: tauri::AppHandle,
    state: tauri::State<'_, VerifyBrowserState>,
    portal_url: String,
    portal_credential: String,
    phone: String,
) -> Result<(), AppError> {
    log::info!("verify_portal_login: checking candidate portal values");
    // The frontend normalizes the trailing slash before saving, but this runs
    // on pre-save input — trim defensively, matching `portal_url()`.
    let base_url = portal_url.trim_end_matches('/');
    let user_data_dir = app.path().app_cache_dir()?.join("profiles").join("verify");

    // Hold the lock for the whole check: it serializes concurrent verifies
    // (they share the profile dir) and parking the browser here is what lets
    // the Exit handler kill it if the app closes mid-login.
    let mut guard = state.0.lock().await;
    let (browser, page) = launch_browser(&user_data_dir, false, "verify").await?;
    *guard = Some(browser);
    let login_result = login_to_portal(&page, &phone, base_url, &portal_credential, "verify").await;
    // Throwaway either way: nothing to keep after the check.
    if let Some(mut browser) = guard.take() {
        let _ = browser.kill().await;
    }
    login_result
}
```

- [ ] **Step 3: Manage the state and register the command in `run()`**

In the `setup` closure, after the two existing `app.manage(...)` calls:

```rust
            app.manage(VerifyBrowserState(Mutex::new(None)));
```

In `invoke_handler`, extend the list:

```rust
        .invoke_handler(tauri::generate_handler![
            get_task_parameters,
            close_browsers,
            submit_task,
            open_member_page,
            verify_portal_login
        ])
```

- [ ] **Step 4: Kill a parked verify browser in the Exit handler**

Replace the `run(...)` closure body:

```rust
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                tauri::async_runtime::block_on(async {
                    app_handle.state::<HeadlessBrowserState>().close().await;
                    app_handle.state::<HeadedBrowserState>().close().await;
                    // The verify browser is throwaway: kill it outright if a
                    // verification was in flight when the app closed.
                    if let Some(mut browser) = app_handle
                        .state::<VerifyBrowserState>()
                        .0
                        .lock()
                        .await
                        .take()
                    {
                        let _ = browser.kill().await;
                    }
                });
            }
        });
```

- [ ] **Step 5: Typecheck the backend**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "Add verify_portal_login command with throwaway browser

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `verifyJiraCredentials` helper (frontend)

**Files:**
- Modify: `src/lib/queries.ts`

**Interfaces:**
- Consumes: `tauriFetch` (already imported in `queries.ts`).
- Produces (Task 4 relies on this): `export async function verifyJiraCredentials(email: string, apiToken: string): Promise<void>` — resolves on valid credentials, throws `Error` with a user-facing message otherwise.

- [ ] **Step 1: Hoist the Jira domain to module scope**

`jiraTasksQueryOptions` currently declares `const JIRA_DOMAIN = "https://living-insider.atlassian.net";` inside its `queryFn`. Move it to module scope (below the imports) so both callers share it, and delete the inner declaration:

```ts
const JIRA_DOMAIN = "https://living-insider.atlassian.net";
```

- [ ] **Step 2: Add the helper**

Place it directly above `jiraTasksQueryOptions`:

```ts
/**
 * Checks that the Jira email + API token actually authenticate, via the cheap
 * `/myself` endpoint. Same failure detection as `jiraTasksQueryOptions`: Jira
 * Cloud may fall back to anonymous access instead of rejecting bad
 * credentials, flagging the failure only via the `x-seraph-loginreason`
 * header. Resolves on success, throws with a user-facing message otherwise.
 */
export async function verifyJiraCredentials(
  email: string,
  apiToken: string,
): Promise<void> {
  const res = await tauriFetch(`${JIRA_DOMAIN}/rest/api/3/myself`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${btoa(`${email}:${apiToken}`)}`,
      Accept: "application/json",
    },
  });
  const loginReason = res.headers.get("x-seraph-loginreason");
  if (loginReason && loginReason !== "OK") {
    throw new Error(
      `Jira authentication failed (${loginReason}) — check your Jira email and API token`,
    );
  }
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? "Jira authentication failed — check your Jira email and API token"
        : `Jira request failed (${res.status} ${res.statusText})`,
    );
  }
}
```

No capability changes: `https://living-insider.atlassian.net/**` is already allowlisted in `src-tauri/capabilities/default.json`.

- [ ] **Step 3: Typecheck the frontend**

Run: `pnpm build`
Expected: `tsc` passes and Vite bundles with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries.ts
git commit -m "Add verifyJiraCredentials helper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `VerifyAccountError` + `useVerifyAccountMutation` (frontend)

**Files:**
- Modify: `src/lib/mutations.ts`

**Interfaces:**
- Consumes: `verifyJiraCredentials` from Task 3; command `verify_portal_login` from Task 2; `Account` type and `invoke` (already imported in `mutations.ts`).
- Produces (Task 5 relies on these):
  - `export class VerifyAccountError extends Error` with `failures: { portal?: string; jira?: string }`; its `message` is the failed checks as `Portal: <msg>` / `Jira: <msg>` lines joined by `\n`.
  - `export function useVerifyAccountMutation()` — a react-query mutation over `(account: Account) => Promise<void>` that throws `VerifyAccountError` when any check fails. No cache interaction, no toast (the form renders the error itself).

- [ ] **Step 1: Import the Jira helper**

Extend the existing import from `./queries`:

```ts
import {
  accountOptions,
  favoritesOptions,
  preferencesOptions,
  taskParametersOptions,
  verifyJiraCredentials,
} from "./queries";
```

- [ ] **Step 2: Add the error class and mutation**

Place both directly above `useSaveAccountMutation` (they run just before it in the save flow):

```ts
export class VerifyAccountError extends Error {
  failures: { portal?: string; jira?: string };

  constructor(failures: { portal?: string; jira?: string }) {
    super(
      [
        failures.portal && `Portal: ${failures.portal}`,
        failures.jira && `Jira: ${failures.jira}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    this.name = "VerifyAccountError";
    this.failures = failures;
  }
}

/**
 * Runs both credential checks in parallel against the *candidate* account
 * values — nothing is saved here, and nothing reads or writes the query
 * cache. The portal check is a real headless-browser login (backend
 * command); the Jira check is a cheap REST call. Throws VerifyAccountError
 * naming each failed check so the Account form can label the error lines.
 * No onError toast: the form shows the error in the dialog instead.
 */
export function useVerifyAccountMutation() {
  return useMutation({
    mutationFn: async (account: Account) => {
      const [portal, jira] = await Promise.allSettled([
        invoke("verify_portal_login", {
          portalUrl: account.portal_url,
          portalCredential: account.portal_credential,
          phone: account.phone,
        }),
        verifyJiraCredentials(account.email, account.api_token),
      ]);
      const failures: { portal?: string; jira?: string } = {};
      // invoke() rejects with the backend's serialized error string
      if (portal.status === "rejected") failures.portal = String(portal.reason);
      if (jira.status === "rejected") {
        failures.jira =
          jira.reason instanceof Error
            ? jira.reason.message
            : String(jira.reason);
      }
      if (failures.portal || failures.jira) {
        throw new VerifyAccountError(failures);
      }
    },
  });
}
```

- [ ] **Step 3: Typecheck the frontend**

Run: `pnpm build`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mutations.ts
git commit -m "Add useVerifyAccountMutation running both credential checks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire verification into `AccountForm`

**Files:**
- Modify: `src/components/account-form.tsx`

**Interfaces:**
- Consumes: `useVerifyAccountMutation` from Task 4; `Account` type from `@/lib/store`; existing `useSaveAccountMutation`, `form`, `Dialog*`, `Button` components.
- Produces: user-facing behavior only (no exports consumed elsewhere).

**Behavior being implemented (from the spec):**
1. Submit → verify both checks in parallel; Save button disabled and labeled "Verifying…" while pending.
2. Both pass → existing save + close (downstream `close_browsers`/invalidation untouched).
3. Any failure → dialog stays open; error box above the footer lists each failed check; "Save anyway" button appears which saves without verification.
4. Error state (and "Save anyway") clears on resubmit (react-query resets on new `mutate`) and on dialog reopen.
5. Closing the dialog mid-verify discards a late success instead of saving it.

- [ ] **Step 1: Update imports**

```ts
import { useEffect, useRef, useState } from "react";
```

Add to the existing mutation/store imports:

```ts
import { useSaveAccountMutation, useVerifyAccountMutation } from "@/lib/mutations";
import type { Account } from "@/lib/store";
```

- [ ] **Step 2: Add a module-level normalize helper**

The trailing-slash normalization currently lives inline in `onSubmit`; it is now needed in two places (verify-then-save and "Save anyway"), so extract it. Place it below `formSchema`:

```ts
// TanStack Form submits the raw field values, not zod's parsed output, so
// schema transforms would never reach the submitted value — normalize the
// trailing slash here (the backend joins with `{base_url}/task.php`).
function normalizePortalUrl(value: Account): Account {
  return { ...value, portal_url: value.portal_url.replace(/\/+$/, "") };
}
```

- [ ] **Step 3: Add the verify mutation and the latest-open ref inside `AccountForm`**

After the existing `const [open, setOpen] = useState(...)`:

```ts
  const verifyAccount = useVerifyAccountMutation();
  // Latest `open` for the async submit flow: closing the dialog while a
  // verification is in flight must discard the result, not save it.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
```

- [ ] **Step 4: Rewrite `onSubmit` to verify before saving**

Replace the existing `onSubmit` in the `useForm` options:

```ts
    onSubmit: async ({ value }) => {
      const account = normalizePortalUrl(value);
      try {
        await verifyAccount.mutateAsync(account);
      } catch {
        // Verification failed: keep the dialog open. The error box and
        // "Save anyway" button render from `verifyAccount` state.
        return;
      }
      // The user may have closed the dialog while verification ran; treat
      // that as a cancel and discard the result.
      if (!openRef.current) return;
      saveAccount.mutate(account);
      setOpen(false);
    },
```

- [ ] **Step 5: Reset verification state when the dialog reopens**

In `handleOpenChange`, inside the `if (next)` branch, after `form.reset(...)`:

```ts
      // drop any verification error from a previous attempt so the error box
      // and "Save anyway" don't reappear on a fresh open
      verifyAccount.reset();
```

- [ ] **Step 6: Add the error box and the footer buttons**

Between `</ScrollArea>` and `<DialogFooter>`:

```tsx
        {verifyAccount.isError && (
          <div
            role="alert"
            className="mb-4 whitespace-pre-line rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm"
          >
            {verifyAccount.error.message}
          </div>
        )}
```

(`whitespace-pre-line` renders the `\n`-joined `Portal:` / `Jira:` lines from `VerifyAccountError`, including the multi-line portal message.)

Replace the `form.Subscribe` block in `DialogFooter`:

```tsx
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => (
              <>
                {verifyAccount.isError && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={!canSubmit}
                    onClick={() => {
                      saveAccount.mutate(normalizePortalUrl(form.state.values));
                      setOpen(false);
                    }}
                  >
                    Save anyway
                  </Button>
                )}
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={!canSubmit || verifyAccount.isPending}
                >
                  {verifyAccount.isPending ? "Verifying…" : "Save"}
                </Button>
              </>
            )}
          </form.Subscribe>
```

Notes: "Save anyway" only renders in the error state, so it never shows during a re-verify (`mutate` resets `isError`). It is `type="button"` so it bypasses form submission (and therefore verification) but still respects `canSubmit` so zod-invalid values can't be saved.

- [ ] **Step 7: Typecheck and lint**

Run: `pnpm build`
Expected: passes.
Run: `npx @biomejs/biome check --write .`
Expected: no remaining diagnostics (it may reorder imports/classes in place).

- [ ] **Step 8: Commit**

```bash
git add src/components/account-form.tsx
git commit -m "Verify account credentials before saving in AccountForm

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Update CLAUDE.md and run the manual verification checklist

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** none (docs + manual QA).

- [ ] **Step 1: Document the new command and lifecycle in CLAUDE.md**

Three edits:

1. In the **"Tauri commands"** section, add after the `close_browsers` bullet:

```markdown
- `verify_portal_login(portal_url, portal_credential, phone)` — logs into the
  portal in a throwaway headless browser (own profile dir,
  `profiles/verify`) using the *candidate* values passed as arguments — it
  never reads `store.json`. Used by the Account form to verify before
  saving; the browser is killed after the check, pass or fail.
```

2. In the **"Browser lifecycle / cleanup"** section, after the sentence about the `Exit` handler calling `.close()` on both states, add:

```markdown
The `Exit` handler also kills the transient `verify_portal_login` browser if
a verification is in flight (parked in `VerifyBrowserState` for exactly this
reason).
```

3. In the **"Frontend structure"** bullet for `account-form.tsx`, replace the "On save:" sentence with:

```markdown
  On save: verifies the candidate values first — portal via
  `verify_portal_login`, Jira via a `/rest/api/3/myself` call — in parallel
  (`useVerifyAccountMutation`); on failure an error box lists each failed
  check and a "Save anyway" button can skip verification (offline / portal
  down). Only then writes to `store.json`, calls `close_browsers`, and
  invalidates `task_parameters`.
```

- [ ] **Step 2: Manual verification (needs real credentials — do this with the user)**

Run `pnpm start` and walk the spec's checklist. The executor cannot know the user's real credentials, so ask the user to perform (or supply values for) these checks and report results:

1. Correct values → "Verifying…" → dialog closes, account saved, date list loads.
2. Wrong phone → `Portal:` error line, save blocked, "Save anyway" saves and closes.
3. Wrong portal credential or URL → `Portal:` error line.
4. Wrong Jira API token → `Jira:` error line only (portal check passes).
5. Both wrong → both lines shown.
6. Network off → both lines shown; "Save anyway" persists the values.
7. Close the dialog while "Verifying…" is showing → nothing saves; reopening shows no stale error.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Document account verification in CLAUDE.md

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
