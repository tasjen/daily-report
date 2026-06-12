import { Label } from "@/components/shared/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shared/select";
import { useSavePreferencesMutation } from "@/lib/mutations";
import { usePreferences, useTaskParameters } from "@/lib/queries";

export default function DefaultProjectSelect() {
  const { data: preferences } = usePreferences();
  const savePreferences = useSavePreferencesMutation();
  const { data } = useTaskParameters();

  if (!data?.projects?.length || !preferences) return null;

  return (
    <Label className="flex flex-col items-start gap-2">
      <p className="flex flex-none items-center gap-1">Default project</p>
      <Select
        items={data.projects}
        value={preferences.default_project ?? data.projects[0].value}
        onValueChange={(val) => {
          savePreferences.mutate({
            ...preferences,
            default_project: val ?? data.projects[0].value,
          });
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {data.projects.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Label>
  );
}
