import { useState } from "react";

import { defaultCheckedKeysOf, type IssueGroup } from "@/lib/date-card-helpers";
import type { TaskGroupType } from "@/lib/store";

export type TaskSelection = {
  // Keys of every currently selected issue, in group display order.
  selectedKeys: string[];
  selectedKeySet: Set<string>;
  // Applies a group's newly reported selection. `groupKeys` scopes the diff to
  // the reporting group, so one TaskSelect can never clear another's issues.
  handleSelectionChange: (groupKeys: string[], selected: string[]) => void;
  // Drops every override, putting all issues back on their group defaults.
  reset: () => void;
};

/**
 * Selection state for a date card's task groups.
 *
 * Issues displayed under a default task group start checked; everything else
 * starts unchecked. The user's explicit toggles are stored as `overrides` on
 * top of that default rather than as a flat selected-set, which is what lets
 * issues arriving from a later refetch — or after the `default_task_groups`
 * preference changes — still pick up the correct default. A flat set would
 * freeze whatever was selected at first render.
 */
export function useTaskSelection(
  issueGroups: IssueGroup[],
  defaultGroupIds: Set<TaskGroupType>,
): TaskSelection {
  const defaultCheckedKeys = defaultCheckedKeysOf(issueGroups, defaultGroupIds);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const selectedKeys = issueGroups
    .flatMap((group) => group.issues)
    .map((issue) => issue.key)
    .filter((key) => overrides[key] ?? defaultCheckedKeys.has(key));
  const selectedKeySet = new Set(selectedKeys);

  // Each TaskSelect reports its group's entire new selection, not which issue
  // was clicked — so diff it against the current effective selection and
  // record overrides only for issues whose state actually changed. Issues the
  // user never touched keep following `defaultCheckedKeys`.
  function handleSelectionChange(groupKeys: string[], selected: string[]) {
    const next = new Set(selected);
    setOverrides((prev) => ({
      ...prev,
      ...Object.fromEntries(
        groupKeys
          .filter((key) => next.has(key) !== selectedKeySet.has(key))
          .map((key) => [key, next.has(key)]),
      ),
    }));
  }

  return {
    selectedKeys,
    selectedKeySet,
    handleSelectionChange,
    reset: () => setOverrides({}),
  };
}
