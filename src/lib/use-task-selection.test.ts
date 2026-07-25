import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildIssueGroups } from "@/lib/date-card-helpers";
import type { TaskGroupType } from "@/lib/store";
import { useTaskSelection } from "@/lib/use-task-selection";
import type { JiraIssue } from "@/type";

function issue(key: string): JiraIssue {
  return {
    id: key,
    key,
    fields: { summary: key, updated: "", duedate: "", status: { name: "" } },
  };
}

type Sets = Partial<Record<TaskGroupType, JiraIssue[]>>;

// Groups are built through buildIssueGroups rather than by hand, so these
// tests see the same post-dedup, defaults-first ordering the card renders.
function groups(sets: Sets, defaultGroupIds: Set<TaskGroupType>) {
  return buildIssueGroups(
    {
      status: sets.status ?? [],
      created: sets.created ?? [],
      sprint: sets.sprint ?? [],
      favorite: sets.favorite ?? [],
    },
    defaultGroupIds,
  );
}

function setup(sets: Sets, defaultGroupIds: Set<TaskGroupType>) {
  return renderHook(
    ({ sets: s, ids }: { sets: Sets; ids: Set<TaskGroupType> }) =>
      useTaskSelection(groups(s, ids), ids),
    { initialProps: { sets, ids: defaultGroupIds } },
  );
}

const DEFAULTS = new Set<TaskGroupType>(["status"]);

describe("useTaskSelection", () => {
  it("starts with the default groups' issues checked and nothing else", () => {
    const { result } = setup(
      { status: [issue("DR-1")], created: [issue("DR-2")] },
      DEFAULTS,
    );
    expect(result.current.selectedKeys).toEqual(["DR-1"]);
  });

  it("records a toggle as an override and reflects it in the selection", () => {
    const { result } = setup(
      { status: [issue("DR-1")], created: [issue("DR-2")] },
      DEFAULTS,
    );

    act(() => {
      result.current.handleSelectionChange(["DR-2"], ["DR-2"]);
    });
    expect(result.current.selectedKeys).toEqual(["DR-1", "DR-2"]);

    act(() => {
      result.current.handleSelectionChange(["DR-1"], []);
    });
    expect(result.current.selectedKeys).toEqual(["DR-2"]);
  });

  it("scopes a group's report to its own keys, leaving other groups alone", () => {
    const { result } = setup(
      { status: [issue("DR-1")], created: [issue("DR-2")] },
      DEFAULTS,
    );

    // The created group reports an empty selection; DR-1 belongs to another
    // group and must survive it.
    act(() => {
      result.current.handleSelectionChange(["DR-2"], []);
    });
    expect(result.current.selectedKeys).toEqual(["DR-1"]);
  });

  it("lets issues from a later refetch pick up the current default", () => {
    const { result, rerender } = setup({ status: [issue("DR-1")] }, DEFAULTS);

    rerender({
      sets: { status: [issue("DR-1"), issue("DR-9")] },
      ids: DEFAULTS,
    });
    // DR-9 was never touched, so it follows the status group's default.
    expect(result.current.selectedKeys).toEqual(["DR-1", "DR-9"]);
  });

  it("moves untouched issues when the default groups change, but not touched ones", () => {
    const { result, rerender } = setup(
      { status: [issue("DR-1")], created: [issue("DR-2")] },
      DEFAULTS,
    );

    // Explicitly uncheck DR-1; DR-2 is left untouched.
    act(() => {
      result.current.handleSelectionChange(["DR-1"], []);
    });

    const sets = { status: [issue("DR-1")], created: [issue("DR-2")] };
    rerender({ sets, ids: new Set<TaskGroupType>(["created"]) });

    // DR-2 follows the new default; DR-1 keeps the user's explicit uncheck
    // even though its group is no longer a default.
    expect(result.current.selectedKeys).toEqual(["DR-2"]);
  });

  it("reset drops every override, putting issues back on their defaults", () => {
    const { result } = setup(
      { status: [issue("DR-1")], created: [issue("DR-2")] },
      DEFAULTS,
    );

    act(() => {
      result.current.handleSelectionChange(["DR-1"], []);
      result.current.handleSelectionChange(["DR-2"], ["DR-2"]);
    });

    act(() => {
      result.current.reset();
    });
    expect(result.current.selectedKeys).toEqual(["DR-1"]);
  });
});
