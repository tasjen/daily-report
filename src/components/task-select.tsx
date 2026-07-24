import { Trans, useLingui } from "@lingui/react/macro";
import { SearchIcon } from "lucide-react";

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
  // render item labels as-is instead of splitting on ": " into
  // "KEY: description" columns (used by the favorites group, whose labels
  // are free text)
  plainLabels?: boolean;
};

export default function TaskSelect({
  items,
  value,
  onValueChange,
  label,
  className,
  plainLabels,
}: Props) {
  const { t } = useLingui();
  const anchor = useComboboxAnchor();
  const allSelected = items.length > 0 && value.length === items.length;
  return (
    <Combobox
      multiple
      items={items}
      value={value}
      onValueChange={onValueChange}
    >
      <div className={className} ref={anchor}>
        {label && (
          <Label className="mb-2 px-1 text-nowrap">
            {label}
            {allSelected && (
              <span className="font-normal text-muted-foreground">
                <Trans>(all selected)</Trans>
              </span>
            )}
          </Label>
        )}
        <ComboboxInput
          startAddon={<SearchIcon className="pointer-events-none" />}
          placeholder={t`Search tasks`}
        />
      </div>
      <ComboboxContent
        anchor={anchor}
        className="w-xl"
        side="top"
        positionerProps={{
          collisionPadding: { bottom: 0 },
        }}
      >
        <ComboboxEmpty>
          <Trans>No tasks found.</Trans>
        </ComboboxEmpty>
        <ComboboxList className="scrollbar-thin scrollbar-thumb-muted-foreground space-y-1">
          {(option: SelectOption) => {
            if (plainLabels) {
              return (
                <ComboboxItem key={option.value} value={option.value}>
                  <span>{option.label}</span>
                </ComboboxItem>
              );
            }
            const splitStr = ": ";
            const splitIndex = option.label.indexOf(splitStr);
            const key = option.label.slice(0, splitIndex);
            const description = option.label.slice(
              splitIndex + splitStr.length,
            );
            return (
              <ComboboxItem
                key={option.value}
                value={option.value}
                className="flex items-start gap-2"
              >
                <span className="flex-none">{key}</span>
                <span>{description}</span>
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
