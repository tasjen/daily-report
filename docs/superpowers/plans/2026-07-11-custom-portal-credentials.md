# Custom Portal Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the compiled-in `ADMIN_BASE` and `BASIC_AUTH_CREDENTIAL` constants; users supply the portal base URL and HTTP Basic-auth credential via the Account form, persisted in `store.json` and read by the Rust backend.

**Architecture:** Two new string fields (`portal_url`, `portal_credential`) on the existing `account` key in `store.json`. The Account dialog collects and validates them (zod v4) and auto-opens until they exist. The Rust backend replaces the two constants with per-use store reads (same pattern as the existing `phone()` read), failing fast with "not configured" errors before any browser launches.

**Tech Stack:** React 19 + TypeScript, TanStack Form + zod v4, `@tauri-apps/plugin-store`; Rust + Tauri 2, `tauri_plugin_store`, chromiumoxide.

**Spec:** `docs/superpowers/specs/2026-07-11-custom-portal-credentials-design.md`

## Global Constraints

- **No compiled-in portal values.** After Task 2, `ADMIN_BASE` and `BASIC_AUTH_CREDENTIAL` must not exist anywhere in the source. No fallback defaults.
- **Field names must match exactly** between TypeScript and Rust: `portal_url`, `portal_credential`, under the `account` key of `store.json`.
- **`portal_url` is stored without a trailing slash** (frontend normalizes on save; Rust trims defensively on read). The backend joins paths as `format!("{base_url}/task.php")`.
- **`portal_credential` is a single `user:pass` string**, base64-encoded verbatim into the `Authorization` header.
- **TanStack Form submits raw field values, not zod's parsed output** — schema `.transform()`s never reach `onSubmit`. Normalization must happen in the submit handler. (The existing space-stripping `onChange` comment in `account-form.tsx` documents the same constraint.)
- **No test suite exists in this repo** (per CLAUDE.md). Gates are `pnpm build` (tsc + vite), `cargo check --manifest-path src-tauri/Cargo.toml`, and a manual `pnpm start` verification checkpoint with the user after Task 2.
- **User-supplied values must only flow into `goto()` / `wait_for_url()`** — never into `evaluate()` JS strings (see the string-interpolation gotcha in CLAUDE.md).
- Biome formats/lints staged files via the lefthook pre-commit hook; commit messages follow the repo's plain imperative style (no `feat:` prefixes) and end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Frontend — collect and persist portal URL + credential

**Files:**
- Modify: `src/lib/store.ts:5-9` (the `Account` type)
- Modify: `src/components/account-form.tsx:35-43` (schema), `:80-109` (open state, defaults, submit, reset), `:134-195` (field JSX)

**Interfaces:**
- Consumes: existing `TextField` component, `useSaveAccountMutation` (persists the whole `Account` object, calls `close_browsers`, invalidates `task_parameters` — unchanged).
- Produces: `Account` type gains `portal_url: string` (valid http(s) URL, no trailing slash) and `portal_credential: string` (`user:pass`); both persisted under the `account` key in `store.json`. Task 2's Rust reads depend on these exact names.

- [ ] **Step 1: Add the two fields to the `Account` type in `src/lib/store.ts`**

Replace the `Account` type (lines 5–9) with:

```ts
export type Account = {
  phone: string;
  email: string;
  api_token: string;
  // Portal base URL, stored without a trailing slash — the backend joins
  // paths as `format!("{base_url}/task.php")`.
  portal_url: string;
  // HTTP Basic-auth credential in "user:pass" form, encoded verbatim into
  // the Authorization header by the backend.
  portal_credential: string;
};
```

Note: stores saved before these fields existed will deserialize without them at runtime even though the type claims they're present — the `?? ""` fallbacks and the auto-open condition in the next steps are what handle that, same as the `favorites ?? []` pattern.

- [ ] **Step 2: Extend the zod schema in `src/components/account-form.tsx`**

Replace the `formSchema` (lines 35–43) with:

```ts
const formSchema = z.object({
  phone: z.string().trim().min(1, "Phone number is required"),
  email: z
    .string()
    .trim()
    .min(1, "Jira email is required")
    .pipe(z.email("Enter a valid email address")),
  api_token: z.string().trim().min(1, "Jira API token is required"),
  portal_url: z
    .string()
    .trim()
    .min(1, "Portal URL is required")
    .pipe(z.url({ protocol: /^https?$/, error: "Enter a valid http(s) URL" })),
  portal_credential: z
    .string()
    .trim()
    .min(1, "Portal credential is required")
    .refine(
      (value) => value.includes(":"),
      "Use the username:password format",
    ),
});
```

(zod v4 API: top-level `z.url()` with `protocol` regex — matched against the protocol *without* the trailing colon — and the unified `error` param.)

- [ ] **Step 3: Extend open-state, defaults, submit normalization, and reset-on-open**

In the `AccountForm` component, replace the `useState` line (line 83):

```ts
// Open automatically until fully configured: covers both a fresh install
// (no account at all) and an existing store saved before the portal fields
// existed. Any account saved through this form always has every field, so
// checking the two newest fields subsumes the old `!account` check.
const [open, setOpen] = useState(
  !account?.portal_url || !account?.portal_credential,
);
```

Replace the `useForm` call (lines 85–96):

```ts
const form = useForm({
  defaultValues: {
    phone: account?.phone ?? "",
    email: account?.email ?? "",
    api_token: account?.api_token ?? "",
    portal_url: account?.portal_url ?? "",
    portal_credential: account?.portal_credential ?? "",
  },
  validators: { onChange: formSchema },
  onSubmit: ({ value }) => {
    // TanStack Form submits the raw field values, not zod's parsed output,
    // so schema transforms would never reach `value` — normalize the
    // trailing slash here (the backend joins with `{base_url}/task.php`).
    saveAccount.mutate({
      ...value,
      portal_url: value.portal_url.replace(/\/+$/, ""),
    });
    setOpen(false);
  },
});
```

Replace the reset object inside `handleOpenChange` (lines 102–106):

```ts
form.reset({
  phone: account?.phone ?? "",
  email: account?.email ?? "",
  api_token: account?.api_token ?? "",
  portal_url: account?.portal_url ?? "",
  portal_credential: account?.portal_credential ?? "",
});
```

- [ ] **Step 4: Add the two fields to the dialog JSX**

Inside `<FieldGroup>` (line 134), insert these two blocks **before** the existing `<form.Field name="phone">` block — the portal gate comes before the login identity:

```tsx
<form.Field name="portal_url">
  {(field) => (
    <TextField
      field={field}
      type="url"
      label={
        <>
          Portal URL <SpanRequired />
        </>
      }
    />
  )}
</form.Field>

<form.Field name="portal_credential">
  {(field) => (
    <TextField
      field={field}
      type="password"
      label={
        <>
          Portal credential <SpanRequired />
        </>
      }
    />
  )}
</form.Field>
```

The shared `TextField` strips spaces as the user types — kept deliberately for both new fields (design decision: consistency; a Basic-auth password containing a space is an accepted edge case).

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm build`
Expected: tsc and vite complete with no errors.

Run: `npx @biomejs/biome check --write .`
Expected: no remaining diagnostics (auto-fixes applied are fine).

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.ts src/components/account-form.tsx
git commit -m "Collect portal URL and credential in the Account form

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

The app still works after this commit: the backend keeps using the constants and simply ignores the two new stored fields until Task 2.

---

### Task 2: Backend — read portal config from store.json, delete the constants

**Files:**
- Modify: `src-tauri/src/lib.rs:11-20` (constants + comment), `:134-143` (`phone()`), new helpers after the `impl BrowserState` block (after line 251), `:183-250` (`launch_and_login`), `:347-372` (`get_task_parameters`), `:374-380` (`open_member_page`), `:382-483` (`submit_task`)

**Interfaces:**
- Consumes: `account.portal_url` / `account.portal_credential` in `store.json`, written by Task 1 (strings; URL normalized without trailing slash; credential `user:pass`).
- Produces (all free functions in `lib.rs`):
  - `fn account_str_field(app: &tauri::AppHandle, field: &str, missing_msg: &'static str) -> Result<String, AppError>`
  - `fn portal_url(app: &tauri::AppHandle) -> Result<String, AppError>` — trailing slashes trimmed
  - `fn portal_credential(app: &tauri::AppHandle) -> Result<String, AppError>`

- [ ] **Step 1: Delete the two constants and update the header comment**

Replace lines 11–14:

```rust
// Portal-specific constants. Update these here if the LivingInsider admin site
// changes its URLs, HTTP-basic gate, or form markup.
const ADMIN_BASE: &str = "https://portal.example.com/team";
const BASIC_AUTH_CREDENTIAL: &str = "user:pass";
```

with:

```rust
// Portal-specific selectors. Update these here if the admin site changes its
// form markup. The portal base URL and Basic-auth credential are NOT compiled
// in: they are user-supplied via the Account form and read from `store.json`
// (`account.portal_url` / `account.portal_credential`) — see `portal_url()`
// and `portal_credential()`.
```

(The `const LOGIN_INPUT_SELECTOR` block that follows stays.)

- [ ] **Step 2: Add the store-reading helpers**

Insert immediately after the closing brace of `impl BrowserState` (after line 251), before `is_page_alive`:

```rust
/// Reads a required string field from the `account` object in `store.json`,
/// erroring with `missing_msg` when the store key, object, or field is absent
/// or empty. Free function (not a `BrowserState` method) so commands can read
/// portal config without holding a browser state reference.
fn account_str_field(
    app: &tauri::AppHandle,
    field: &str,
    missing_msg: &'static str,
) -> Result<String, AppError> {
    let store = app.store("store.json")?;
    let value = store
        .get("account")
        .and_then(|v| v.get(field).and_then(|f| f.as_str().map(String::from)))
        .filter(|s| !s.is_empty())
        .ok_or(missing_msg)?;
    Ok(value)
}

/// The user-configured portal base URL. Trailing slashes are trimmed
/// defensively — callers join paths as `format!("{base_url}/task.php")` —
/// though the frontend already normalizes on save.
fn portal_url(app: &tauri::AppHandle) -> Result<String, AppError> {
    let url = account_str_field(app, "portal_url", "Portal URL not configured")?;
    Ok(url.trim_end_matches('/').to_string())
}

/// The user-configured HTTP Basic-auth credential (`user:pass`), encoded
/// verbatim into the `Authorization` header.
fn portal_credential(app: &tauri::AppHandle) -> Result<String, AppError> {
    account_str_field(
        app,
        "portal_credential",
        "Portal credential not configured",
    )
}
```

- [ ] **Step 3: Delegate `phone()` to the shared helper**

Replace the `phone()` method body (lines 134–143) with:

```rust
    /// Reads the configured login phone number from `store.json`. Errors before
    /// any browser is launched if it isn't set.
    fn phone(&self) -> Result<String, AppError> {
        account_str_field(&self.app, "phone", "Phone number not configured")
    }
```

- [ ] **Step 4: Use the config in `launch_and_login`**

Replace the phone read at the top of `launch_and_login` (lines 184–186):

```rust
        // Read the config first so a missing value fails before we spend the
        // cost of launching a browser.
        let phone = self.phone()?;
        let base_url = portal_url(&self.app)?;
        let credential = portal_credential(&self.app)?;
```

Replace the auth-header + navigation lines (207 and 212):

```rust
        let token = STANDARD.encode(&credential);
```

```rust
        page.goto(base_url.as_str()).await?;
```

Replace the `wait_for_url` call and error message (lines 227–234):

```rust
        wait_for_url(&page, &format!("{base_url}/member.php"), 5_000)
            .await
            .map_err(|e| {
                log::warn!("{} browser login failed: {e}", self.label());
                AppError::from(format!(
                    "{e}\nWrong phone number, portal URL, or portal credential — or the portal was slow to respond"
                ))
            })?;
```

- [ ] **Step 5: Switch the three commands over**

`get_task_parameters` (lines 350–359) — read the URL before `get_page` so a missing config fails before a browser launches, and replace both `ADMIN_BASE` navigations:

```rust
    let base_url = portal_url(&state.app)?;
    let page = state.get_page().await?;

    page.goto(format!("{base_url}/task.php")).await?;
```

…and further down in the same function:

```rust
    page.goto(format!("{base_url}/member.php")).await?;
```

`open_member_page` (lines 375–380):

```rust
#[tauri::command]
async fn open_member_page(state: tauri::State<'_, HeadedBrowserState>) -> Result<(), AppError> {
    let base_url = portal_url(&state.app)?;
    let page = state.get_page().await?;
    page.goto(format!("{base_url}/member.php")).await?;
    page.bring_to_front().await?;
    Ok(())
}
```

`submit_task` — insert the read before `get_page` (line 392) and replace the two `ADMIN_BASE` sites (lines 393 and 471):

```rust
    let base_url = portal_url(&state.app)?;
    let page = state.get_page().await?;
    page.goto(format!("{base_url}/task.php")).await?;
```

```rust
    wait_for_url(&page, &format!("{base_url}/task_report.php"), 10_000)
```

- [ ] **Step 6: Verify no compiled-in portal values remain**

Run: `grep -n "ADMIN_BASE\|BASIC_AUTH_CREDENTIAL\|portal.example.com\|user" src-tauri/src/lib.rs`
Expected: no matches (exit code 1).

- [ ] **Step 7: Typecheck the backend**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: `Finished` with no errors or warnings about unused items.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "Read portal URL and credential from store.json instead of constants

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Manual end-to-end verification (checkpoint with the user)**

Run: `pnpm start`, then have the user (or drive it if possible) confirm:

1. With `portal_url`/`portal_credential` absent from the store, the Account dialog opens automatically; existing fields are pre-filled.
2. Validation rejects a non-URL (`not a url`), a non-http(s) URL (`ftp://x`), and a colon-less credential; Save stays disabled.
3. A URL entered with a trailing slash is saved without it (re-open the dialog: the field shows the normalized value).
4. After saving real values: the date list loads (headless login works), "open member page" shows the logged-in member page (headed login works), and a submit pre-fills the task form.
5. Missing-config path (upgrade case: account exists but portal fields don't): close the auto-opened dialog without saving, then click the date-list refresh — a "Portal URL not configured" toast appears and no browser launches.

---

### Task 3: Docs — update CLAUDE.md for user-supplied portal config

**Files:**
- Modify: `CLAUDE.md` — the "Browser login flow" section, the "Tauri commands" note on selectors (no change needed — verify), the `account:` line + prose in "Account, preferences & favorites", the `account-form.tsx` bullet in "Frontend structure", and the "Hardcoded values" bullet in "Conventions & gotchas"

**Interfaces:**
- Consumes: the final behavior implemented in Tasks 1–2 (field names, auto-open condition, fail-fast reads).
- Produces: documentation only.

- [ ] **Step 1: Update the "Browser login flow" numbered steps**

Replace the four numbered steps with:

```markdown
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
```

- [ ] **Step 2: Update the store.json schema section**

Replace the `account:` line in the schema block:

```ts
account:     { phone, email, api_token, portal_url, portal_credential }
```

Replace the paragraph that begins "`phone` authenticates into the admin portal" so it opens:

```markdown
`phone` authenticates into the admin portal; `portal_url` (portal base URL,
stored without a trailing slash) and `portal_credential` (`user:pass` for the
portal's HTTP basic gate) tell the backend where that portal is — all three
are read by the Rust side. `email` + `api_token` authenticate to Jira.
```

(The rest of the paragraph about `default_project`/`auto_submit`/`favorites` stays as is.)

- [ ] **Step 3: Update the `account-form.tsx` bullet in "Frontend structure"**

Change "dialog to edit secrets (phone, Jira email, Jira API token)" to "dialog to edit secrets (portal URL, portal credential, phone, Jira email, Jira API token)" and change "Opens automatically when no account exists." to "Opens automatically until the portal fields are configured (covers fresh installs and stores saved before those fields existed)."

- [ ] **Step 4: Rewrite the "Hardcoded values" gotcha**

Replace:

```markdown
- **Hardcoded values** live in `lib.rs`: the admin URL, the Basic-auth credential,
  and the login selectors. These are portal-specific; update here if the portal
  changes.
```

with:

```markdown
- **Hardcoded values** live in `lib.rs`: the login/form selectors only. They are
  portal-specific; update them if the portal's markup changes. The portal base
  URL and Basic-auth credential are *not* compiled in — they are user-supplied
  via the Account form (`account.portal_url` / `account.portal_credential` in
  `store.json`) and read per-use by `portal_url()` / `portal_credential()`.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md for user-supplied portal config

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
