import * as React from "react";

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
import { useTaskParameters } from "@/lib/queries";
import { Label } from "./components/shared/label";
import type { SelectOption } from "./type";

type Props = Pick<
  React.ComponentProps<typeof Combobox<string[]>>,
  "value" | "onValueChange"
>;
export function ProjectListSelect(props: Props) {
  const { data } = useTaskParameters();
  const projects = data?.projects ?? [];
  const [open, setOpen] = React.useState(false);
  const anchor = useComboboxAnchor();

  return (
    <div className="flex flex-col gap-2 items-start">
      <Label className="flex-none">Project list</Label>
      <Combobox
        open={open}
        onOpenChange={setOpen}
        multiple
        autoHighlight
        items={projects}
        {...props}
      >
        <ComboboxTrigger
          render={
            <ComboboxChips ref={anchor} className="w-full">
              <ComboboxValue>
                {(values: string[]) => (
                  <React.Fragment>
                    {values.map((v: string) => (
                      <ComboboxChip key={v}>
                        {projects.find((p) => p.value === v)?.label}
                      </ComboboxChip>
                    ))}
                    <ComboboxChipsInput
                      placeholder={!values.length ? "Add project" : undefined}
                    />
                  </React.Fragment>
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
