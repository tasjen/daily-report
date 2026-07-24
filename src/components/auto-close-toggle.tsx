import { Trans } from "@lingui/react/macro";
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
      <Label className="flex items-center gap-2 text-sm font-normal">
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
        <Trans>Auto-close browser</Trans>
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
          <Trans>Closes the browser window after the form is submitted</Trans>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
