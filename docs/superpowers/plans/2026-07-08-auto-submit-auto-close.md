# Auto-submit & Auto-close Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add two chained preference toggles — Auto-submit (backend submits the portal's task form after filling it) and Auto-close (backend closes the headed browser after the submission is confirmed).

**Architecture:** Two new boolean `Preferences` fields persisted in `store.json`. The frontend enforces the dependency chain Auto-fill → Auto-submit → Auto-close by disabling child toggles and cascading `false` downward on save, so stored values are always consistent. The Rust `submit_task` command reads the flags from the store (same pattern as `default_project`) and acts on them after filling the form.

**Tech Stack:** Tauri 2 (Rust backend, chromiumoxide CDP), React 19 + TypeScript, `@tauri-apps/plugin-store`, react-query.

**Spec:** `docs/superpowers/specs/2026-07-08-auto-submit-auto-close-design.md`

## Global Constraints

- No test suite exists in this repo (per CLAUDE.md). Verification gates are `pnpm build` (frontend typecheck+bundle), `cargo check --manifest-path src-tauri/Cargo.toml` (backend typecheck), and a final manual `pnpm start` pass.
- Store field names must stay in sync between `src/lib/store.ts` and `src-tauri/src/lib.rs`: `auto_submit`, `auto_close` (snake_case, exactly these).
- New `Preferences` fields MUST get defaults in `DEFAULT_PREFERENCES` — the per-field merge in `preferencesOptions` is what upgrades stores saved before the fields existed. Both default to `false`.
- Cascade invariant: `auto_close` implies `auto_submit` implies `autofill_summary`. Every save must preserve it.
- Path alias `@/` → `src/`. Biome enforces sorted Tailwind classes and organized imports; the lefthook pre-commit hook auto-fixes staged files.
- Never mutate objects from the react-query cache (spread into new objects, as the existing toggles do).

---

### Task 1: Store schema — `auto_submit` / `auto_close` fields

**Files:**
- Modify: `src/lib/store.ts` (the `Preferences` type and `DEFAULT_PREFERENCES`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Preferences.auto_submit: boolean` and `Preferences.auto_close: boolean` (both default `false`) — Task 3's toggle components read and save these; Task 2's Rust code reads the same JSON keys from `store.json`.

- [x] **Step 1: Add the fields to the type and defaults**

In `src/lib/store.ts`, change the `Preferences` type and `DEFAULT_PREFERENCES`:

```ts
export type Preferences = {
  default_project: string | null;
  project_list: string[];
  default_task_groups: TaskGroupType[];
  autofill_summary: boolean;
  auto_submit: boolean;
  auto_close: boolean;
};

// Fallback merged under whatever is persisted, so preferences saved before a
// field existed still come back with that field populated.
export const DEFAULT_PREFERENCES: Preferences = {
  default_project: null,
  project_list: [],
  default_task_groups: ["status"],
  autofill_summary: true,
  auto_submit: false,
  auto_close: false,
};
```

- [x] **Step 2: Verify the frontend still typechecks**

Run: `pnpm build`
Expected: succeeds. (Adding required fields to `Preferences` compiles because every consumer spreads whole `preferences` objects; the only literal of the full type is `DEFAULT_PREFERENCES`, updated above.)

- [x] **Step 3: Commit**

```bash
git add src/lib/store.ts
git commit -m "Add auto_submit and auto_close preference fields"
```

---

### Task 2: Backend — act on the flags in `submit_task`

**Files:**
- Modify: `src-tauri/src/lib.rs` (constants block near line 13–19; end of `submit_task`, currently ending at the `Ok(())` around line 441)

**Interfaces:**
- Consumes: `preferences.auto_submit` / `preferences.auto_close` JSON keys from `store.json` (written by Tasks 1/3; absent keys read as `false`). Existing helpers: `wait_for_url(&Page, &str, u64)`, `BrowserState::close()`, `ADMIN_BASE`.
- Produces: no signature change — `submit_task(date, summary)` keeps its exact Tauri command signature. New constant `TASK_FORM_SELECTOR: &str = "form[action='task.php']"`.

- [x] **Step 1: Add the form selector constant**

In the portal constants block at the top of `src-tauri/src/lib.rs`, after `TASK_COMMENT_TEXTAREA_1`:

```rust
const TASK_FORM_SELECTOR: &str = "form[action='task.php']";
```

- [x] **Step 2: Extend `submit_task`**

Replace the final `Ok(())` of `submit_task` (directly after the `if !project_list.is_empty() { ... }` block) with:

```rust
    let auto_submit = store
        .get("preferences")
        .and_then(|v| v.get("auto_submit").and_then(|b| b.as_bool()))
        .unwrap_or(false);
    if !auto_submit {
        return Ok(());
    }

    // The selector contains single quotes, so pass it through
    // `serde_json::to_string` instead of hand-wrapping it in '...'
    // (same technique as the login selector).
    log::info!("submit_task: auto-submitting the task form");
    let form_selector_js = serde_json::to_string(TASK_FORM_SELECTOR)?;
    page.evaluate(format!(
        "document.querySelector({form_selector_js}).submit();"
    ))
    .await?;

    let auto_close = store
        .get("preferences")
        .and_then(|v| v.get("auto_close").and_then(|b| b.as_bool()))
        .unwrap_or(false);
    if !auto_close {
        return Ok(());
    }

    // Only close once the portal confirms the submission by navigating to
    // member.php. On timeout the submission state is unknown: return the
    // error and leave the browser open so the user can see what happened.
    wait_for_url(&page, &format!("{ADMIN_BASE}/member.php"), 10_000)
        .await
        .map_err(|e| {
            log::warn!("auto-close skipped, submission not confirmed: {e}");
            AppError::from(format!(
                "{e}\nThe portal didn't confirm the submission; leaving the browser open"
            ))
        })?;
    log::info!("submit_task: submission confirmed, closing headed browser");
    state.close().await;

    Ok(())
```

Notes for the implementer:
- `store` and `page` are already in scope from the existing body; `state` is the `tauri::State<'_, HeadedBrowserState>` parameter and derefs through the newtype to `BrowserState::close()`.
- `close()` is safe to call here: `get_page()`'s lock guard was released when it returned, and `close()` re-acquires the mutex itself.
- The stored flags can be trusted without re-checking the chain (`auto_close` implies `auto_submit`) because the frontend cascades `false` downward on every save (Task 3).

- [x] **Step 3: Verify the backend compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: succeeds with no warnings about unused variables/constants.

- [x] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "Auto-submit task form and auto-close browser per preferences"
```

---

### Task 3: UI — toggle components and cascade

**Files:**
- Create: `src/components/auto-submit-toggle.tsx`
- Create: `src/components/auto-close-toggle.tsx`
- Modify: `src/components/autofill-summary-toggle.tsx` (cascade on save)
- Modify: `src/components/preferences-form.tsx` (render the new toggles)

**Interfaces:**
- Consumes: `Preferences.auto_submit`/`auto_close` from Task 1; existing `usePreferences()` (react-query hook returning `{ data: Preferences | undefined }`) and `useSavePreferencesMutation()` (mutation taking a full `Preferences` object); shared `Switch` (forwards base-ui `disabled` prop), `Label`, `Tooltip`/`TooltipTrigger`/`TooltipContent`.
- Produces: default-exported React components `AutoSubmitToggle` and `AutoCloseToggle`.

- [x] **Step 1: Create `src/components/auto-submit-toggle.tsx`**

The tooltip sits in a sibling of the `Label` (not inside it) so clicking the info icon can't toggle the switch:

```tsx
import { InfoIcon } from "lucide-react";
import { Label } from "@/components/shared/label";
import { Switch } from "@/components/shared/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shared/tooltip";
import { useSavePreferencesMutation } from "@/lib/mutations";
import { usePreferences } from "@/lib/queries";

export default function AutoSubmitToggle() {
  const { data: preferences } = usePreferences();
  const savePreferences = useSavePreferencesMutation();

  if (!preferences) return null;

  return (
    <div className="flex items-center gap-1">
      <Label className="flex items-center gap-2 font-normal text-sm">
        <Switch
          checked={preferences.auto_submit}
          disabled={!preferences.autofill_summary}
          onCheckedChange={(checked) =>
            savePreferences.mutate({
              ...preferences,
              auto_submit: checked,
              // turning auto-submit off also disarms auto-close
              auto_close: checked && preferences.auto_close,
            })
          }
        />
        Auto-submit report
      </Label>
      <Tooltip>
        <TooltipTrigger
          render={
            <span>
              <InfoIcon size={16} className="inline" />
            </span>
          }
        />
        <TooltipContent>
          Submits the task form automatically after filling the summary
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
```

- [x] **Step 2: Create `src/components/auto-close-toggle.tsx`**

```tsx
import { InfoIcon } from "lucide-react";
import { Label } from "@/components/shared/label";
import { Switch } from "@/components/shared/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shared/tooltip";
import { useSavePreferencesMutation } from "@/lib/mutations";
import { usePreferences } from "@/lib/queries";

export default function AutoCloseToggle() {
  const { data: preferences } = usePreferences();
  const savePreferences = useSavePreferencesMutation();

  if (!preferences) return null;

  return (
    <div className="flex items-center gap-1">
      <Label className="flex items-center gap-2 font-normal text-sm">
        <Switch
          checked={preferences.auto_close}
          disabled={!preferences.auto_submit}
          onCheckedChange={(checked) =>
            savePreferences.mutate({
              ...preferences,
              auto_close: checked,
            })
          }
        />
        Auto-close browser
      </Label>
      <Tooltip>
        <TooltipTrigger
          render={
            <span>
              <InfoIcon size={16} className="inline" />
            </span>
          }
        />
        <TooltipContent>
          Closes the browser window after the form is submitted
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
```

- [x] **Step 3: Cascade in `src/components/autofill-summary-toggle.tsx`**

Change the `onCheckedChange` handler (only this — the rest of the file stays as-is):

```tsx
        onCheckedChange={(checked) =>
          savePreferences.mutate({
            ...preferences,
            autofill_summary: checked,
            // turning auto-fill off disarms the dependent toggles
            auto_submit: checked && preferences.auto_submit,
            auto_close: checked && preferences.auto_close,
          })
        }
```

- [x] **Step 4: Render the toggles in `src/components/preferences-form.tsx`**

Add the imports:

```tsx
import AutoCloseToggle from "@/components/auto-close-toggle";
import AutoSubmitToggle from "@/components/auto-submit-toggle";
```

and render them between `AutofillSummaryToggle` and `ThemeToggle`:

```tsx
          <AutofillSummaryToggle />
          <AutoSubmitToggle />
          <AutoCloseToggle />
          <ThemeToggle />
```

- [x] **Step 5: Lint + typecheck**

Run: `npx @biomejs/biome check --write .`
Expected: no remaining diagnostics (import order may be auto-fixed).

Run: `pnpm build`
Expected: succeeds.

- [x] **Step 6: Commit**

```bash
git add src/components/auto-submit-toggle.tsx src/components/auto-close-toggle.tsx src/components/autofill-summary-toggle.tsx src/components/preferences-form.tsx
git commit -m "Add auto-submit and auto-close preference toggles"
```

---

### Task 4: Manual verification pass

**Files:** none (verification only).

**Interfaces:**
- Consumes: the full feature from Tasks 1–3.
- Produces: confirmation the feature works end-to-end.

- [ ] **Step 1: Run the app**

Run: `pnpm start`
Expected: app launches; Preferences dialog shows the two new toggles under "Auto-fill report summary".

- [ ] **Step 2: Exercise the toggle chain in the Preferences dialog**

- With Auto-fill on: Auto-submit is enabled; Auto-close is disabled until Auto-submit is on.
- Turn all three on, then turn Auto-fill off: Auto-submit and Auto-close both flip off and become disabled.
- Turn Auto-fill back on: children stay off (no spring-back).
- Turn Auto-submit + Auto-close on, then Auto-submit off: Auto-close flips off and disables.

- [ ] **Step 3: Exercise the submit flows on a date card (Play button)**

- All extras off: form is pre-filled, browser stays on the form (current behavior).
- Auto-submit on, Auto-close off: form is filled and submitted; browser stays open on `member.php`; the date disappears from the list.
- Auto-submit + Auto-close on: form is filled and submitted; headed browser closes after the redirect; the date disappears from the list.

- [ ] **Step 4: Confirm the persisted store**

Check `store.json` (macOS: `~/Library/Application Support/<app-id>/store.json`) after toggling: `preferences.auto_submit` / `preferences.auto_close` present and consistent with the chain invariant.
