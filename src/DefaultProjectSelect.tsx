import type { ComponentProps } from "react";
import { Label } from "./components/shared/label";
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
    <Label className="flex flex-col gap-2 items-start">
      <p className="flex-none flex items-center gap-1">Default project</p>
      <Select items={projects} {...props}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {projects.map((item) => (
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
