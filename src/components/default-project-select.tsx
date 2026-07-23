import { InfoIcon } from "lucide-react";
import { Label } from "@/components/shared/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shared/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shared/tooltip";
import { useSavePreferencesMutation } from "@/lib/mutations";
import { usePreferences, useTaskParameters } from "@/lib/queries";

export default function DefaultProjectSelect() {
  const { data: preferences } = usePreferences();
  const savePreferences = useSavePreferencesMutation();
  const { data } = useTaskParameters();

  const firstProject = data?.projects[0];
  if (!firstProject || !preferences) return null;

  return (
    <div className="flex flex-col items-start gap-2">
      <Label className="flex flex-none items-center gap-1">
        Default project
        <Tooltip>
          <TooltipTrigger
            render={
              <span>
                <InfoIcon size={16} className="inline" />
              </span>
            }
          />
          <TooltipContent>
            The portal project that tasks without a Project mapping entry fall
            back to — and the first dropdown's default when the form is
            otherwise empty
          </TooltipContent>
        </Tooltip>
      </Label>
      <Select
        items={data.projects}
        value={preferences.default_project ?? firstProject.value}
        onValueChange={(val) => {
          savePreferences.mutate({
            ...preferences,
            default_project: val ?? firstProject.value,
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
    </div>
  );
}
