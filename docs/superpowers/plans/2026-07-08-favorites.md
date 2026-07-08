# Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Free-form favorite tasks the user saves once (star-icon dialog in the sidebar) and selectively includes in any date card's report, rendered as a fourth task group and prepended to the summary as plain bullets.

**Architecture:** New top-level `favorites: string[]` key in `store.json` with a react-query query + optimistic save mutation (mirroring `preferences`). In the date card, each favorite is wrapped in a `favorite:`-prefixed issue-shaped object so the existing dedup/default-checked/override/selection machinery works unchanged; the summary builder splits favorites back out into leading plain `• text` lines. Spec: `docs/superpowers/specs/2026-07-08-favorites-design.md`.

**Tech Stack:** React 19 + TypeScript, @tanstack/react-query, @tauri-apps/plugin-store (`LazyStore`), @formkit/auto-animate, Tailwind v4 + shadcn-style components on @base-ui/react, lucide-react.

## Global Constraints

- **This repo has no test suite and must not gain one** (CLAUDE.md: "There are no tests. Verify changes by running `pnpm start` and exercising the UI."). Each task's verify cycle is: `pnpm build` (typecheck + bundle) and `npx @biomejs/biome check --write .` (lint/format), plus manual `pnpm start` checks where the task has visible behavior.
- **Never mutate objects from the react-query cache** (CLAUDE.md). All favorites updates build new arrays (`[...prev, x]`, `.filter()`).
- **Rust backend untouched.** The `favorites` key is frontend-only; `submit_task` already receives the fully built summary string.
- Work on the `favorites` branch (already created; contains the spec commit).
- Path alias `@/` → `src/`. Biome enforces sorted Tailwind classes and organized imports; the lefthook pre-commit hook auto-fixes staged files (if it rewrites files during commit, re-stage and commit again).
- The favorite key prefix is exactly `favorite:` everywhere (module constant `FAVORITE_KEY_PREFIX` in `date-card.tsx`).
- Empty-state copy on date cards is exactly `No tasks selected` / `No tasks found`.
- Commit messages follow repo style: short imperative subject, no `feat:` prefix (see `git log --oneline`), ending with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.

---

### Task 1: Favorites data layer (store type, query, mutation)

**Files:**
- Modify: `src/lib/store.ts` (after the `Account` type block, before `TaskGroupType`)
- Modify: `src/lib/queries.ts` (after `usePreferences`, ~line 38)
- Modify: `src/lib/mutations.ts` (append after `useSavePreferencesMutation`)

**Interfaces:**
- Consumes: existing `store` (`LazyStore`) from `@/lib/store`.
- Produces:
  - `export type Favorites = string[]` in `@/lib/store`
  - `export function favoritesOptions()` and `export function useFavorites(): UseQueryResult<Favorites>` in `@/lib/queries`
  - `export function useSaveFavoritesMutation()` in `@/lib/mutations` — `mutate(favorites: Favorites)` persists the whole array and optimistically updates the `["favorites"]` cache.

- [ ] **Step 1: Add the `Favorites` type to `src/lib/store.ts`**

Insert between the `Account` type and `TaskGroupType`:

```ts
// Free-form favorite tasks, insertion-ordered. Frontend-only: the Rust side
// never reads this key. The text itself is the identity — the favorites
// dialog rejects duplicates, so no generated ids.
export type Favorites = string[];
```

- [ ] **Step 2: Add `favoritesOptions` / `useFavorites` to `src/lib/queries.ts`**

Add `Favorites` to the existing `@/lib/store` import type list, then insert after `usePreferences`:

```ts
export function favoritesOptions() {
  return queryOptions({
    // stores saved before the key existed return undefined, hence ?? []
    queryKey: ["favorites"],
    queryFn: async () => (await store.get<Favorites>("favorites")) ?? [],
  });
}

export function useFavorites() {
  return useQuery(favoritesOptions());
}
```

- [ ] **Step 3: Add `useSaveFavoritesMutation` to `src/lib/mutations.ts`**

Add `favoritesOptions` to the `./queries` import and `type Favorites` to the `./store` import, then append:

```ts
export function useSaveFavoritesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (favorites: Favorites) => {
      await store.set("favorites", favorites);
      await store.save();
      return favorites;
    },
    // Optimistic for the same reason as preferences: consumers compute the
    // next array from the current one, so a late cache write would let rapid
    // edits clobber each other.
    onMutate: async (favorites) => {
      await queryClient.cancelQueries(favoritesOptions());
      const previous = queryClient.getQueryData(favoritesOptions().queryKey);
      queryClient.setQueryData(favoritesOptions().queryKey, favorites);
      return { previous };
    },
    onError: (error, _favorites, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          favoritesOptions().queryKey,
          context.previous,
        );
      }
      toast.error(String(error));
    },
  });
}
```

- [ ] **Step 4: Verify**

Run: `pnpm build`
Expected: exits 0 (tsc + vite succeed).

Run: `npx @biomejs/biome check --write .`
Expected: no remaining errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.ts src/lib/queries.ts src/lib/mutations.ts
git commit -m "Add favorites store key with query and save mutation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Favorites dialog in the sidebar

**Files:**
- Create: `src/components/favorites-form.tsx`
- Modify: `src/App.tsx` (sidebar, directly above `<PreferencesForm />`)

**Interfaces:**
- Consumes: `useFavorites` from `@/lib/queries`, `useSaveFavoritesMutation` from `@/lib/mutations` (Task 1); shared `Dialog`/`Button`/`Input` components; `useAutoAnimate` from `@formkit/auto-animate/react` (returns `[ref]`).
- Produces: `export default function FavoritesForm()` — self-contained dialog, no props.

- [ ] **Step 1: Create `src/components/favorites-form.tsx`**

```tsx
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { PlusIcon, StarIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/shared/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shared/dialog";
import { Input } from "@/components/shared/input";
import { useSaveFavoritesMutation } from "@/lib/mutations";
import { useFavorites } from "@/lib/queries";

export default function FavoritesForm() {
  const { data: favorites } = useFavorites();
  const saveFavorites = useSaveFavoritesMutation();
  const [text, setText] = useState("");
  const [listRef] = useAutoAnimate();

  // The trimmed text is the favorite's identity, so adding is disabled for
  // an empty result or an exact duplicate of an existing favorite.
  const trimmed = text.trim();
  const canAdd = Boolean(
    trimmed && favorites && !favorites.includes(trimmed),
  );

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canAdd || !favorites) return;
    saveFavorites.mutate([...favorites, trimmed]);
    setText("");
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="icon-xl" variant="ghost">
            <StarIcon className="size-6" />
          </Button>
        }
      />
      <DialogContent initialFocus={false} className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StarIcon />
            Favorites
          </DialogTitle>
        </DialogHeader>
        {favorites?.length ? (
          <ul ref={listRef} className="flex flex-col gap-1">
            {favorites.map((favorite) => (
              <li key={favorite} className="flex items-center gap-2">
                <span className="flex-1 break-all">{favorite}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    saveFavorites.mutate(
                      favorites.filter((f) => f !== favorite),
                    )
                  }
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground italic">No favorites yet</p>
        )}
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a favorite task"
          />
          <Button type="submit" disabled={!canAdd}>
            <PlusIcon />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Note: adds and deletes save immediately (like the preferences toggles) — there is deliberately no Save/Cancel step. If Biome's organize-imports reorders anything, accept its ordering.

- [ ] **Step 2: Mount it in `src/App.tsx`**

Add the import (Biome will sort it):

```ts
import FavoritesForm from "@/components/favorites-form";
```

In the sidebar `<header>`, insert directly above `<PreferencesForm />`, unconditionally (it manages local data only — no portal or Jira dependency, unlike its `taskParametersQuery.isSuccess`-gated neighbors):

```tsx
        <RefreshDateListButton />
        <FavoritesForm />
        {taskParametersQuery.isSuccess && <PreferencesForm />}
```

- [ ] **Step 3: Verify build + lint**

Run: `pnpm build`
Expected: exits 0.

Run: `npx @biomejs/biome check --write .`
Expected: no remaining errors.

- [ ] **Step 4: Verify behavior in the running app**

Run: `pnpm start`, then:
1. A star button appears in the sidebar directly above the preferences (gear) button.
2. Clicking it opens a "Favorites" dialog showing "No favorites yet".
3. Type "Daily standup" → Add button enables → click Add (or press Enter) → row appears, input clears.
4. Add "Support tickets". Re-type "Daily standup" → Add button stays disabled (duplicate). Type only spaces → disabled (empty after trim).
5. Delete a row via its trash button → row animates out.
6. Close and reopen the app: favorites persist (they're in the app's `store.json`).

- [ ] **Step 5: Commit**

```bash
git add src/components/favorites-form.tsx src/App.tsx
git commit -m "Add favorites dialog to the sidebar

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `plainLabels` prop on TaskSelect

**Files:**
- Modify: `src/components/task-select.tsx`

**Interfaces:**
- Produces: optional `plainLabels?: boolean` prop on `TaskSelect`. When set, item labels render as a single span instead of being split on `": "` into key + description spans. Behavior without the prop is unchanged.

- [ ] **Step 1: Add the prop**

In `src/components/task-select.tsx`, extend `Props` and the destructuring:

```ts
type Props = {
  items: SelectOption[];
  value: string[];
  onValueChange: (keys: string[]) => void;
  label?: string;
  className?: string;
  // render item labels as-is instead of splitting on ": " into
  // "KEY: description" columns (used by the favorites group, whose labels
  // are free text)
  plainLabels?: boolean;
};

export default function TaskSelect({
  items,
  value,
  onValueChange,
  label,
  className,
  plainLabels,
}: Props) {
```

Replace the `ComboboxList` render function body with:

```tsx
          {(option: SelectOption) => {
            if (plainLabels) {
              return (
                <ComboboxItem key={option.value} value={option.value}>
                  <span>{option.label}</span>
                </ComboboxItem>
              );
            }
            const splitStr = ": ";
            const splitIndex = option.label.indexOf(splitStr);
            const key = option.label.slice(0, splitIndex);
            const description = option.label.slice(
              splitIndex + splitStr.length,
            );
            return (
              <ComboboxItem
                key={option.value}
                value={option.value}
                className="flex items-start gap-2"
              >
                <span className="flex-none">{key}</span>
                <span>{description}</span>
              </ComboboxItem>
            );
          }}
```

- [ ] **Step 2: Verify**

Run: `pnpm build`
Expected: exits 0.

Run: `npx @biomejs/biome check --write .`
Expected: no remaining errors.

(No visible change yet — nothing passes the prop until Task 4. Optionally spot-check in `pnpm start` that date-card dropdowns still render `KEY  summary` in two columns.)

- [ ] **Step 3: Commit**

```bash
git add src/components/task-select.tsx
git commit -m "Add plainLabels prop to TaskSelect

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Favorites as a fourth task group on date cards

**Files:**
- Modify: `src/lib/store.ts` (the `TaskGroupType` union)
- Modify: `src/lib/task-groups.ts`
- Modify: `src/components/date-card.tsx`

**Interfaces:**
- Consumes: `useFavorites` (Task 1), `plainLabels` prop on `TaskSelect` (Task 3).
- Produces: `TaskGroupType` union gains `"favorite"`; `TASK_GROUPS` gains `{ type: "favorite", label: "Favorites" }` as its **last** entry. `DefaultTaskGroupsSelect` picks the new checkbox up automatically (it maps `TASK_GROUPS`) — no change to that file.

- [ ] **Step 1: Extend the task group type and list**

In `src/lib/store.ts`:

```ts
export type TaskGroupType = "status" | "created" | "sprint" | "favorite";
```

In `src/lib/task-groups.ts`, replace the whole file (comment updated for the fourth, non-Jira group):

```ts
import type { TaskGroupType } from "@/lib/store";

// The task groups shown on each date card, in base priority order: three
// Jira-queried groups plus the user's saved favorites (local, free-form).
// Shared between DateCard (grouping/ordering) and the preferences form
// (default-selected checkboxes) so ids and labels stay in sync.
export const TASK_GROUPS: { type: TaskGroupType; label: string }[] = [
  { type: "status", label: "Status updated by me" },
  { type: "created", label: "Created today by me" },
  { type: "sprint", label: "Assigned to me not done" },
  { type: "favorite", label: "Favorites" },
];
```

- [ ] **Step 2: Wire favorites into `src/components/date-card.tsx`**

Add `useFavorites` to the existing `@/lib/queries` import:

```ts
import { useFavorites, useJiraTasksQuery, usePreferences } from "@/lib/queries";
```

Add a module-level constant (below the imports, above the `Props` type):

```ts
// Prefix that namespaces favorite keys away from real Jira issue keys, so
// dedup/selection state can never collide and the summary builder can split
// favorites back out of the flat selection.
const FAVORITE_KEY_PREFIX = "favorite:";
```

Inside `DateCard`, after the three Jira queries and before the `preferences` read, add:

```ts
  const { data: favorites } = useFavorites();
  // Favorites masquerade as issues so the existing dedup/default-checked/
  // override machinery applies unchanged. buildSummary never sees them —
  // they're split back out into plain leading lines.
  const favoriteIssues = useMemo(
    () =>
      (favorites ?? []).map((text) => ({
        id: text,
        key: `${FAVORITE_KEY_PREFIX}${text}`,
        fields: {
          summary: text,
          status: { name: "" },
          updated: "",
          duedate: "",
        },
      })),
    [favorites],
  );
```

In the `issueGroups` memo, add the `favorite` entry to `issuesById` and `favoriteIssues` to the dependency array:

```ts
    const issuesById: Record<TaskGroupType, JiraIssue[]> = {
      status: statusQuery.data?.issues ?? [],
      created: createdQuery.data?.issues ?? [],
      sprint: sprintQuery.data?.issues ?? [],
      favorite: favoriteIssues,
    };
```

```ts
  }, [
    statusQuery.data,
    createdQuery.data,
    sprintQuery.data,
    favoriteIssues,
    defaultGroupIds,
  ]);
```

- [ ] **Step 3: Special-case the favorite group's option labels**

Replace the `optionGroups` memo's mapping with (favorites show their text alone in insertion order; Jira issues keep `KEY: summary` sorted by key):

```ts
  const optionGroups = useMemo(
    () =>
      issueGroups.map((group) => ({
        type: group.id,
        label: group.label,
        keys: group.issues.map((issue) => issue.key),
        // Favorites show their text alone, in the order they were added;
        // Jira issues show "KEY: summary" sorted by key.
        items:
          group.id === "favorite"
            ? group.issues.map((issue) => ({
                value: issue.key,
                label: issue.fields.summary,
              }))
            : group.issues
                .map((issue) => ({
                  value: issue.key,
                  label: `${issue.key}: ${issue.fields.summary}`,
                }))
                .sort((a, b) => a.value.localeCompare(b.value)),
      })),
    [issueGroups],
  );
```

In the JSX, pass the prop to `TaskSelect`:

```tsx
            <TaskSelect
              key={group.type}
              className="min-w-0 flex-1"
              label={group.label}
              items={group.items}
              plainLabels={group.type === "favorite"}
              value={group.keys.filter((key) => selectedKeySet.has(key))}
              onValueChange={(selected) =>
                handleSelectionChange(group.keys, selected)
              }
            />
```

- [ ] **Step 4: Prepend selected favorites to the summary**

Replace the `summaryText` memo with:

```ts
  // Selected favorites lead the summary as plain "• text" lines outside any
  // status block; the remaining Jira issues are grouped by status as before.
  // Issues displayed under the "created" group are relabeled to a synthetic
  // "Created" status so buildSummary's group-by-status gives them their own
  // [Created] block. Cloned, not mutated — issues live in the react-query cache.
  const summaryText = useMemo(() => {
    const selected = new Set(selectedKeys);
    const selectedIssues = allIssues.filter((issue) =>
      selected.has(issue.key),
    );
    const createdKeys = new Set(
      issueGroups
        .find((group) => group.id === "created")
        ?.issues.map((issue) => issue.key) ?? [],
    );
    const favoriteLines = selectedIssues
      .filter((issue) => issue.key.startsWith(FAVORITE_KEY_PREFIX))
      .map((issue) => `• ${issue.fields.summary}`)
      .join("\n");
    const jiraSummary = buildSummary(
      selectedIssues
        .filter((issue) => !issue.key.startsWith(FAVORITE_KEY_PREFIX))
        .map((issue) =>
          createdKeys.has(issue.key)
            ? create(issue, (draft) => {
                draft.fields.status.name = "Created";
              })
            : issue,
        ),
    );
    return [favoriteLines, jiraSummary].filter(Boolean).join("\n\n");
  }, [allIssues, issueGroups, selectedKeys]);
```

- [ ] **Step 5: Generalize the empty-state copy**

In the card's JSX, `allIssues` now includes favorites, so the copy drops "Jira":

```tsx
              // no tasks at all vs. tasks exist but none selected (reachable
              // when `default_task_groups` is empty or all were unchecked)
              allIssues.length ? (
                "No tasks selected"
              ) : (
                "No tasks found"
              )
```

- [ ] **Step 6: Verify build + lint**

Run: `pnpm build`
Expected: exits 0. (If `tsc` reports a missing `favorite` key on a `Record<TaskGroupType, ...>` anywhere, a spot that enumerates groups was missed — fix it before proceeding.)

Run: `npx @biomejs/biome check --write .`
Expected: no remaining errors.

- [ ] **Step 7: Verify behavior in the running app**

Run: `pnpm start`, then on any date card (with at least two favorites saved, e.g. "Daily standup" and "Support tickets"):
1. A "Favorites" `TaskSelect` group appears alongside the Jira groups; its dropdown lists favorite texts as single-column rows, in the order they were added, all unchecked by default.
2. Check "Daily standup" → the summary starts with `• Daily standup`, then a blank line, then the `[Status]` blocks (if any Jira issues are selected). With only favorites selected, the summary is just the bullet lines.
3. Open Preferences → "Default selected task groups" now lists a fourth checkbox "Favorites". Enable it → on a card refresh (circular-arrows button), all favorites start checked and the Favorites group moves into the leading default-group partition.
4. Uncheck a favorite, hit the card's refresh button → it re-checks (override reset), matching the other groups' behavior.
5. With no Jira issues on a date and nothing selected, the card reads "No tasks selected" (favorites exist) — and with no favorites saved and no issues, "No tasks found" with no Favorites group rendered.
6. Delete a favorite from the star dialog while a card shows it → the group updates; selection state stays consistent.

- [ ] **Step 8: Commit**

```bash
git add src/lib/store.ts src/lib/task-groups.ts src/components/date-card.tsx
git commit -m "Render favorites as a fourth task group on date cards

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: End-to-end verification against the real portal

**Files:** none (verification only).

**Interfaces:** none.

This step needs the human's real account (portal phone + Jira credentials) — hand it to the user if credentials aren't already configured in the running app.

- [ ] **Step 1: Full flow**

Run: `pnpm start`, then:
1. Save favorites, select a mix of favorites + Jira issues on today's card.
2. Verify the copy button copies exactly the on-screen summary (favorite bullets first, blank line, status blocks).
3. Hit the submit (Play) button → the headed browser opens the portal form pre-filled; confirm the comment field matches the summary, including the leading favorite bullets and blank line.

- [ ] **Step 2: Confirm nothing else regressed**

1. Cards without favorites behave exactly as before (labels, sorting, `[Created]` block).
2. Preferences dialog and account dialog still open/save normally.
