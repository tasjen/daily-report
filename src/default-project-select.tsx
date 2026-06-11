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
import { useGlobalState } from "./store";

export default function DefaultProjectSelect() {
  const store = useGlobalState((state) => state.store);
  const preferences = useGlobalState((state) => state.preferences);
  const setPreferences = useGlobalState((state) => state.setPreferences);
  const { data } = useTaskParameters();

  if (!data?.projects?.length || !preferences) return null;

  return (
    <Label className="flex flex-col gap-2 items-start">
      <p className="flex-none flex items-center gap-1">Default project</p>
      <Select
        items={data.projects}
        value={preferences.default_project ?? data.projects[0].value}
        onValueChange={async (val) => {
          const newPreferences: typeof preferences = {
            ...preferences,
            default_project: val ?? data.projects[0].value,
          };
          await store.set("preferences", newPreferences);
          await store.save();
          setPreferences(newPreferences);
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
    </Label>
  );
}
