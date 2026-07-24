import { Trans, useLingui } from "@lingui/react/macro";
import { InfoIcon } from "lucide-react";

import { Checkbox } from "@/components/shared/checkbox";
import { Label } from "@/components/shared/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shared/tooltip";
import { useSavePreferencesMutation } from "@/lib/mutations";
import { usePreferences } from "@/lib/queries";
import type { TaskGroupType } from "@/lib/store";
import { TASK_GROUPS } from "@/lib/task-groups";

export default function DefaultTaskGroupsSelect() {
  const { i18n } = useLingui();
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
      <Label className="flex flex-none items-center gap-1">
        <Trans>Default selected task groups</Trans>
        <Tooltip>
          <TooltipTrigger
            render={
              <span>
                <InfoIcon size={16} className="inline" />
              </span>
            }
          />
          <TooltipContent>
            <Trans>
              The task groups whose issues start all checked by default
            </Trans>
          </TooltipContent>
        </Tooltip>
      </Label>
      <div className="flex flex-col gap-1">
        {TASK_GROUPS.map((group) => (
          <Label
            key={group.type}
            className="flex items-center gap-2 text-sm font-normal"
          >
            <Checkbox
              checked={selected.has(group.type)}
              onCheckedChange={(checked) => toggle(group.type, checked)}
            />
            {i18n._(group.label)}
          </Label>
        ))}
      </div>
    </div>
  );
}
