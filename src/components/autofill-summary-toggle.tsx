import { Label } from "@/components/shared/label";
import { Switch } from "@/components/shared/switch";
import { useSavePreferencesMutation } from "@/lib/mutations";
import { usePreferences } from "@/lib/queries";

export default function AutofillSummaryToggle() {
  const { data: preferences } = usePreferences();
  const savePreferences = useSavePreferencesMutation();

  if (!preferences) return null;

  return (
    <Label className="flex items-center gap-2 font-normal text-sm">
      <Switch
        checked={preferences.autofill_summary}
        onCheckedChange={(checked) =>
          savePreferences.mutate({
            ...preferences,
            autofill_summary: checked,
            // turning auto-fill off disarms the dependent toggles
            auto_submit: checked && preferences.auto_submit,
            auto_close: checked && preferences.auto_close,
          })
        }
      />
      Auto-fill report summary
    </Label>
  );
}
