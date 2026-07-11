# Custom portal credentials — design

**Date:** 2026-07-11
**Branch:** `feat/custom-portal-credentials`

## Goal

Remove the embedded `ADMIN_BASE` and `BASIC_AUTH_CREDENTIAL` constants from
`src-tauri/src/lib.rs`. Users supply the portal base URL and the HTTP
Basic-auth credential through the UI; both are persisted in `store.json` and
read by the Rust backend. After this change, no portal-identifying URL or
secret remains compiled into the binary (form/login selectors stay — they are
markup, not secrets).

## Decisions (settled during brainstorming)

1. **No compiled-in defaults or fallbacks.** Both values are required. When
   either is missing the backend errors ("Portal URL not configured" /
   "Portal credential not configured") and the Account dialog opens
   automatically.
2. **The fields live on the existing Account form** and are stored under the
   existing `account` key — not a new Settings form. This reuses the
   auto-open-when-missing behavior and the save flow (which already calls
   `close_browsers` and invalidates `task_parameters`) for free.
3. **The credential is a single `user:pass` field**, stored exactly in the
   format the old constant used. The backend base64-encodes it unchanged.

## Data model

`account` in `store.json` gains two fields:

```ts
account: {
  phone: string,
  email: string,
  api_token: string,
  portal_url: string,        // e.g. "https://portal.example.com/team", no trailing slash
  portal_credential: string, // "user:pass"
}
```

## Frontend changes

- **`src/lib/store.ts`** — add `portal_url` and `portal_credential` to the
  `Account` type.
- **`src/components/account-form.tsx`**
  - Two new `TextField`s: "Portal URL" (`type="url"`) and "Portal credential"
    (`type="password"`, like the Jira API token field).
  - Zod validation:
    - `portal_url`: trimmed, required, valid `http(s)` URL; trailing slashes
      stripped on save (the backend joins with `format!("{base}/task.php")`).
    - `portal_credential`: trimmed, required, must contain a `:`; the error
      message explains the `username:password` format.
  - Auto-open condition changes from `!account` to "no account **or** either
    portal field missing/empty", so existing users upgrading are prompted with
    their old fields pre-filled and only the new ones to complete.
  - `defaultValues` and the reset-on-open in `handleOpenChange` extended with
    the two new fields (`?? ""`).
  - The shared `TextField` strips spaces as the user types; this is kept for
    both new fields (consistent with the existing fields; a Basic-auth
    password containing a space is a rare edge case we accept).
- **`src/lib/mutations.ts`** — no changes. `useSaveAccountMutation` already
  persists the whole account object, calls `close_browsers` (required here
  too: a live browser session belongs to the old portal/credential), and
  invalidates `task_parameters`.

## Backend changes (`src-tauri/src/lib.rs`)

- Delete the `ADMIN_BASE` and `BASIC_AUTH_CREDENTIAL` constants.
- Add two store-reading helpers alongside the existing `phone()` pattern, as
  free functions taking `&tauri::AppHandle` (so both `BrowserState` methods
  and commands can use them):
  - `portal_url(app)` — reads `account.portal_url`, defensively
    `trim_end_matches('/')`, errors with "Portal URL not configured" when
    missing/empty.
  - `portal_credential(app)` — reads `account.portal_credential`, errors with
    "Portal credential not configured" when missing/empty.
- `BrowserState::launch_and_login` reads both helpers (plus `phone()`)
  **before** launching Chromium — same fail-fast rationale as the existing
  phone read — then uses the credential for the `Authorization` header and the
  URL for `goto` / `wait_for_url`.
- The three commands that navigate (`get_task_parameters`, `open_member_page`,
  `submit_task`) read `portal_url` at the top and use it in their
  `goto`/`wait_for_url` calls. All 7 former `ADMIN_BASE` usage sites switch
  over.
- The user-supplied values flow only into `goto()` and `wait_for_url()` —
  never into `evaluate()` JS strings — so the string-interpolation gotcha
  documented in CLAUDE.md is not widened.
- Broaden the login-failure message ("Incorrect phone number, or the portal
  was slow to respond") to also mention a possibly wrong portal URL or
  credential, since those are now user-supplied failure causes.

## Error handling

- Missing config: helpers error before any browser launches; the message
  surfaces as a toast via the existing command-error path.
- Wrong URL/credential: `goto` failure or `wait_for_url` timeout surfaces the
  broadened login-failure message.

## Docs

Update CLAUDE.md:

- The "Hardcoded values" gotcha (admin URL and Basic-auth credential no longer
  live in `lib.rs`).
- The `store.json` schema section (new `account` fields, noting both are also
  read by the Rust side).

## Testing / verification

There are no automated tests in this repo. Verify with:

1. `cargo check --manifest-path src-tauri/Cargo.toml` and `pnpm build`.
2. `pnpm start`:
   - With the new fields absent, the Account dialog opens automatically and
     requires them; validation rejects a non-URL and a colon-less credential.
   - After filling them in, the date list scrapes, "open member page" works,
     and a submit pre-fills the form (i.e. login with stored URL + credential
     succeeds end to end).
