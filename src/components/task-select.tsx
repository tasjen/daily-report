import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
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
  const anchor = useComboboxAnchor();
  return (
    <Combobox
      multiple
      items={items}
      value={value}
      onValueChange={onValueChange}
    >
      <div className="mt-4" ref={anchor}>
        <ComboboxInput showTrigger={false} placeholder="Search tasks" />
      </div>
      <ComboboxContent
        anchor={anchor}
        className="w-xl"
        side="bottom"
        positionerProps={{
          collisionAvoidance: { side: "none" },
          collisionPadding: { bottom: 0 },
        }}
      >
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
