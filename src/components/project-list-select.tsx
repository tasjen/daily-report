import { InfoIcon } from "lucide-react";
import { Fragment } from "react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/shared/combobox";
import { Label } from "@/components/shared/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shared/tooltip";
import { useSavePreferencesMutation } from "@/lib/mutations";
import { usePreferences, useTaskParameters } from "@/lib/queries";
import type { SelectOption } from "@/type";

export function ProjectListSelect() {
  const { data: preferences } = usePreferences();
  const savePreferences = useSavePreferencesMutation();
  const { data } = useTaskParameters();
  const projects = data?.projects ?? [];
  const anchor = useComboboxAnchor();

  if (!data?.projects.length || !preferences) return null;

  return (
    <div className="flex flex-col items-start gap-2">
      <Label className="flex flex-none items-center gap-1">
        Project list
        <Tooltip>
          <TooltipTrigger
            render={
              <span>
                <InfoIcon size={16} className="inline" />
              </span>
            }
          />
          <TooltipContent>
            Limits the portal form's project options to these projects; leave
            empty to keep all projects
          </TooltipContent>
        </Tooltip>
      </Label>
      <Combobox
        multiple
        autoHighlight
        items={projects}
        value={preferences.project_list}
        onValueChange={(val) => {
          savePreferences.mutate({
            ...preferences,
            project_list: val,
          });
        }}
      >
        <ComboboxTrigger
          nativeButton={false}
          render={
            <ComboboxChips ref={anchor} className="w-full">
              <ComboboxValue>
                {(values: string[]) => (
                  <Fragment>
                    {values.map((v: string) => (
                      <ComboboxChip key={v}>
                        {projects.find((p) => p.value === v)?.label}
                      </ComboboxChip>
                    ))}
                    <ComboboxChipsInput
                      placeholder={!values.length ? "Add project" : undefined}
                    />
                  </Fragment>
                )}
              </ComboboxValue>
            </ComboboxChips>
          }
        />

        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>No items found.</ComboboxEmpty>
          <ComboboxList>
            {(project: SelectOption) => (
              <ComboboxItem key={project.value} value={project.value}>
                {project.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
