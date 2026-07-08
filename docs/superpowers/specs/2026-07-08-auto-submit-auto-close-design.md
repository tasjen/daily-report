# Auto-submit & Auto-close preferences — design

**Date:** 2026-07-08
**Status:** Approved

## Goal

Add two preference toggles that extend the existing submit flow:

- **Auto-submit** — when on, `submit_task` submits the portal's task form
  (`form[action='task.php']`) itself after filling the summary, instead of
  leaving the click to the user.
- **Auto-close** — when on, after the auto-submitted form navigates to
  `member.php`, the headed browser instance is closed.

## Toggle dependency chain (cascade rule)

`Auto-fill → Auto-submit → Auto-close`. A toggle is enabled only while its
parent is on; a parent turning off **saves its children as off** (cascade), it
does not merely hide them. Consequences:

- Re-enabling a parent leaves children off until explicitly re-enabled — the
  app never auto-submits unless the user just armed it.
- Stored values in `store.json` are always consistent (`auto_close` implies
  `auto_submit` implies `autofill_summary`), so the backend can read them
  directly without re-deriving the chain.

## Store schema

`Preferences` ([src/lib/store.ts](../../../src/lib/store.ts)) gains:

```ts
auto_submit: boolean; // default false
auto_close: boolean;  // default false
```

Defaults live in `DEFAULT_PREFERENCES`; the per-field merge in
`preferencesOptions` upgrades stores saved before these fields existed.

## UI

Two new components following the `AutofillSummaryToggle` pattern
(`usePreferences` + `useSavePreferencesMutation`), rendered directly after it
in `PreferencesForm`:

- **`AutoSubmitToggle`** — `checked: preferences.auto_submit`,
  `disabled: !preferences.autofill_summary`. Turning it **off** also saves
  `auto_close: false`.
- **`AutoCloseToggle`** — `checked: preferences.auto_close`,
  `disabled: !preferences.auto_submit`.
- **`AutofillSummaryToggle`** (existing) — turning it **off** also saves
  `auto_submit: false, auto_close: false`.

Each new toggle gets an `InfoIcon` tooltip matching the existing
`DefaultProjectSelect` pattern:

- Auto-submit: "Submits the task form automatically after filling the summary"
- Auto-close: "Closes the browser window after the form is submitted"

## Backend (`submit_task` in src-tauri/src/lib.rs)

Chosen approach: the backend reads the flags from `store.json`, matching how
`default_project`/`project_list` are already read. No command-signature change.

At the end of `submit_task`, after the project-list filter:

1. Read `auto_submit` from the `preferences` key. If false → done (current
   behavior: user clicks submit).
2. If true, submit the form via `page.evaluate`. New constant
   `TASK_FORM_SELECTOR: &str = "form[action='task.php']"`; the selector is
   passed through `serde_json::to_string` because it contains single quotes
   (same technique as the login selector).
3. Read `auto_close`. If true, `wait_for_url(&page, "{ADMIN_BASE}/member.php",
   10_000)`, then close the headed browser (`state.close().await`).

### Error handling

If `wait_for_url` times out, return the error (the frontend toasts it) and
**leave the browser open** — the submission state is unknown and the visible
page lets the user verify. Known consequence: the date is only removed from
the list on `Ok`, so a submission that actually landed despite the timeout
leaves the date behind; the open browser lets the user confirm and the next
parameter refresh reconciles it.

## Out of scope

- No changes to `DateCard` — the Play button flow is untouched; all new
  behavior lives behind `submit_task`.
- No change to `bring_to_front()`: with auto-close on, the browser still
  appears briefly and then closes.

## Verification

No test suite; verify by `pnpm start`:

1. All toggles off → current behavior (form filled, user submits).
2. Auto-fill + Auto-submit → form filled and submitted, browser stays open on
   `member.php`.
3. Auto-fill + Auto-submit + Auto-close → form submitted, browser closes.
4. Cascades: turning Auto-fill off forces both children off and disabled;
   turning Auto-submit off forces Auto-close off and disabled; re-enabling a
   parent leaves children off.
5. `cargo check` for the backend; `pnpm build` for the frontend.
