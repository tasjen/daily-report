import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/shared/combobox";
import { Label } from "@/components/shared/label";
import type { SelectOption } from "@/type";

type Props = {
  items: SelectOption[];
  value: string[];
  onValueChange: (keys: string[]) => void;
  label?: string;
  className?: string;
};

export default function TaskSelect({
  items,
  value,
  onValueChange,
  label,
  className,
}: Props) {
  const anchor = useComboboxAnchor();
  return (
    <Combobox
      multiple
      items={items}
      value={value}
      onValueChange={onValueChange}
    >
      <div className={className} ref={anchor}>
        {label && <Label className="mb-2 px-1">{label}</Label>}
        <ComboboxInput showTrigger={false} placeholder="Search tasks" />
      </div>
      <ComboboxContent
        anchor={anchor}
        className="w-xl"
        side="top"
        positionerProps={{
          collisionPadding: { bottom: 0 },
        }}
      >
        <ComboboxEmpty>No tasks found.</ComboboxEmpty>
        <ComboboxList className="scrollbar-thin scrollbar-thumb-muted-foreground space-y-1">
          {(option: SelectOption) => (
            <ComboboxItem
              key={option.value}
              value={option.value}
              className="flex items-start gap-2"
            >
              {(() => {
                const [key, description] = option.label.split(": ");
                return (
                  <>
                    <span className="flex-none">{key}</span>
                    <span>{description}</span>
                  </>
                );
              })()}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
