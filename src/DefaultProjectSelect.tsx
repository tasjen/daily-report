import type { ComponentProps } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/shared/select";
import { useTaskParameters } from "./lib/queries";

type Props = ComponentProps<typeof Select<string>>;

export default function DefaultProjectSelect(props: Props) {
  const { data } = useTaskParameters();
  const projects = data?.projects ?? [];

  return (
    <Select items={projects} {...props}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {projects?.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
