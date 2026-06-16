import { PlusIcon } from "lucide-react";
import { Button } from "@/components/shared/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/shared/combobox";
import type { SelectOption } from "@/type";

type Props = {
  items: SelectOption[];
  value: string[];
  onValueChange: (keys: string[]) => void;
};

// Multi-select dropdown with a Plus-icon trigger. Selected items show a check
// in the list; there is no chips/value display on the trigger itself.
export default function TaskSelect({ items, value, onValueChange }: Props) {
  return (
    <Combobox
      multiple
      items={items}
      value={value}
      onValueChange={onValueChange}
    >
      <ComboboxTrigger
        showChevron={false}
        render={<Button size="icon-lg" variant="ghost" />}
      >
        <PlusIcon />
      </ComboboxTrigger>
      <ComboboxContent className="w-xl">
        <ComboboxInput showTrigger={false} placeholder="Search tasks" />
        <ComboboxEmpty>No tasks found.</ComboboxEmpty>
        <ComboboxList>
          {(option: SelectOption) => (
            <ComboboxItem key={option.value} value={option.value}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
