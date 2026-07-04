import { Checkbox } from "@/components/shared/checkbox";
import { Label } from "@/components/shared/label";
import { useSavePreferencesMutation } from "@/lib/mutations";
import { usePreferences } from "@/lib/queries";
import type { TaskGroupType } from "@/lib/store";
import { TASK_GROUPS } from "@/lib/task-groups";

export default function DefaultTaskGroupsSelect() {
  const { data: preferences } = usePreferences();
  const savePreferences = useSavePreferencesMutation();

  if (!preferences) return null;

  const selected = new Set(preferences.default_task_groups);

  function toggle(type: TaskGroupType, checked: boolean) {
    if (!preferences) return;
    // Stored in base TASK_GROUPS order so the persisted array is stable
    // regardless of the order boxes were clicked.
    const next = TASK_GROUPS.map((group) => group.type).filter((groupType) =>
      groupType === type ? checked : selected.has(groupType),
    );
    savePreferences.mutate({ ...preferences, default_task_groups: next });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Label className="flex-none">Default selected task groups</Label>
      <div className="flex flex-col gap-1">
        {TASK_GROUPS.map((group) => (
          <Label
            key={group.type}
            className="flex items-center gap-2 font-normal text-sm"
          >
            <Checkbox
              checked={selected.has(group.type)}
              onCheckedChange={(checked) =>
                toggle(group.type, checked === true)
              }
            />
            {group.label}
          </Label>
        ))}
      </div>
    </div>
  );
}
