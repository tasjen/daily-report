import type { TaskGroupType } from "@/lib/store";

// The three Jira task groups shown on each date card, in base priority order.
// Shared between DateCard (grouping/ordering) and the preferences form
// (default-selected checkboxes) so ids and labels stay in sync.
export const TASK_GROUPS: { type: TaskGroupType; label: string }[] = [
  { type: "status", label: "Status updated by me" },
  { type: "created", label: "Created today by me" },
  { type: "sprint", label: "Assigned to me not done" },
];
