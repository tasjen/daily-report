import type { ComponentProps } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/shared/select";
import { useTaskOptions } from "./useTaskOptions";

type Props = ComponentProps<typeof Select<string>>;

export default function DefaultProjectSelect(props: Props) {
  const { data: taskOptions } = useTaskOptions();
  const projectOptions = taskOptions?.projects ?? [];

  return (
    <Select items={projectOptions} {...props}>
      <SelectTrigger className="w-60">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {projectOptions.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
