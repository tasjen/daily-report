# Favorites — design

Date: 2026-07-08
Status: approved

## Summary

Add a **Favorites** feature: free-form text tasks the user saves once and can
selectively include in any date card's report, alongside the Jira-queried
groups. Managed in a star-icon dialog in the sidebar, directly above
Preferences.

## Decisions made during brainstorming

- Favorites are **free-form text** the user types (e.g. "Daily standup") —
  not starred Jira issues.
- Selected favorites appear at the **start of the summary** as plain
  `• <text>` lines, outside any status block.
- Favorites render as a **fourth task group** on each date card, and
  "Favorites" becomes a fourth option in the existing
  `default_task_groups` preference (opt-in; not default-checked).
- The dialog supports **add + delete only** — no in-place edit, no reorder.
- Chosen approach: **synthetic issue-shaped entries through the existing
  date-card pipeline** (smallest diff, follows existing patterns), with a
  new top-level `favorites` store key.

## Data model & persistence

`store.json` gains a third top-level key alongside `account` and
`preferences`:

```ts
favorites: string[] // favorite texts, insertion-ordered
```

- The text is the identity. The dialog rejects duplicates (after trim), so
  no generated IDs.
- Frontend-only: the Rust backend never reads this key.
- `src/lib/store.ts`: document the key in the schema comment;
  `TaskGroupType` gains `"favorite"`.
- `src/lib/task-groups.ts`: `TASK_GROUPS` gains
  `{ type: "favorite", label: "Favorites" }` as the **last** entry. It then
  lists last in the preferences checkboxes and obeys the card's existing
  ordering rule (default groups first, base order within each partition).
- `DEFAULT_PREFERENCES.default_task_groups` stays `["status"]`.
- `src/lib/queries.ts`: `favoritesOptions()` / `useFavorites()` —
  `queryKey: ["favorites"]`, `queryFn` returns
  `(await store.get<string[]>("favorites")) ?? []` (covers stores saved
  before the key existed; no migration needed).
- `src/lib/mutations.ts`: `useSaveFavoritesMutation` — persists the whole
  array and updates the react-query cache **optimistically in `onMutate`**,
  mirroring `useSavePreferencesMutation` (consumers compute the next array
  from the current one, so a late cache write would let rapid edits clobber
  each other).

## Favorites dialog

New `src/components/favorites-form.tsx`, modeled on `PreferencesForm`:

- `Dialog` with a `StarIcon` trigger (`size="icon-xl" variant="ghost"`,
  matching sidebar siblings), placed directly above `<PreferencesForm />`
  in `src/App.tsx`. Rendered unconditionally — it manages local data only,
  with no portal or Jira dependency.
- Content: the list of saved favorites, each row showing its text with a
  delete button; plus a text input with an Add button (Enter also submits).
- Every add/delete mutates immediately (like the preferences toggles) —
  no Save/Cancel step.
- Add validation: trim the input; disable Add when the result is empty or
  an exact duplicate of an existing favorite.
- The list animates with `@formkit/auto-animate`.

## Date card integration

`src/components/date-card.tsx` additionally calls `useFavorites()` and wraps
each favorite in a memoized issue-shaped object:

```ts
{
  id: text,
  key: `favorite:${text}`,
  fields: { summary: text, status: { name: "" }, updated: "", duedate: "" },
}
```

The `favorite:` prefix keeps these keys disjoint from real Jira keys, so the
existing dedup, `defaultCheckedKeys`, `overrides`, and selection machinery
work unchanged — `issuesById` just gains a `favorite` entry. If "Favorites"
is in `default_task_groups`, all favorites start checked, same rule as the
Jira groups. The per-card refresh button resets overrides for favorites too
(they snap back to the preference default), matching the other groups.

Two display special-cases, both keyed on the group (never content-sniffing):

1. **Option labels:** the favorite group's items use the favorite text alone
   as the label (not `KEY: summary`) and keep insertion order instead of the
   alphabetical sort applied to Jira groups.
2. **`TaskSelect` rendering:** it currently assumes every label contains
   `": "` and splits it into key + description spans; a plain label would
   render garbled. Add an optional `plainLabels` prop; when set (passed only
   for the favorites group), each item renders as a single span.

## Summary building

`summaryText` partitions the selected issues by the `favorite:` key prefix:

- Selected favorites become one leading block of plain `• <text>` lines
  (insertion order), no heading.
- Remaining Jira issues flow through `buildSummary` unchanged (including
  the `[Created]` relabel).
- The two parts join with a blank line:

```
• Daily standup
• Support tickets

[Done]
• PROJ-12: Fix login bug
```

The card's empty-state copy generalizes from "No Jira issues selected /
found" to "No tasks selected / found", since the flat issue union now
includes favorites.

## Edge cases & errors

- **No favorites saved** → the group is dropped by the existing
  empty-group filter; the card looks exactly as it does today.
- **Favorite deleted while cards are open** → the cache update propagates;
  a stale override for a removed key is harmless (selection is always
  intersected with live issues).
- **Old `store.json` without the key** → handled by `?? []` in the query fn.
- **Rust backend** → untouched; `submit_task` already receives the fully
  built summary string.

## Testing / verification

The repo has no test suite (per CLAUDE.md). Verify by running `pnpm start`
and exercising:

1. Add and delete favorites in the star dialog (including duplicate and
   empty-input rejection).
2. Toggle "Favorites" in the default-task-groups preference; confirm
   favorites start checked/unchecked on cards accordingly.
3. Confirm the favorites group renders on cards, selection toggles work,
   and the refresh button re-applies defaults.
4. Confirm summary format: favorites first as plain bullets, blank line,
   then status blocks; copy button copies the same text.
5. Submit a real report and confirm the portal's comment field matches.
