import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { TaskGroupType } from "@/lib/store";

// The task groups shown on each date card, in base priority order: three
// Jira-queried groups plus the user's saved favorites (local, free-form).
// Shared between DateCard (grouping/ordering) and the preferences form
// (default-selected checkboxes) so ids and labels stay in sync.
export const TASK_GROUPS: {
  type: TaskGroupType;
  label: MessageDescriptor;
}[] = [
  { type: "status", label: msg`Status updated by me` },
  { type: "created", label: msg`Created today by me` },
  { type: "sprint", label: msg`Assigned to me not done` },
  { type: "favorite", label: msg`Favorites` },
];
