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
