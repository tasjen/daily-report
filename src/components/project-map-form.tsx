import { useAutoAnimate } from "@formkit/auto-animate/react";
import { InfoIcon, MoveRightIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/shared/button";
import { Input } from "@/components/shared/input";
import { Label } from "@/components/shared/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shared/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shared/tooltip";
import { useSavePreferencesMutation } from "@/lib/mutations";
import { usePreferences, useTaskParameters } from "@/lib/queries";

// The portal's task form has 3 project/textarea row pairs, so a mapping can
// target at most 3 distinct portal projects.
const MAX_DISTINCT_PROJECTS = 3;

export default function ProjectMapForm() {
  const { data: preferences } = usePreferences();
  const savePreferences = useSavePreferencesMutation();
  const { data } = useTaskParameters();
  const [key, setKey] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [listRef] = useAutoAnimate();

  const firstProject = data?.projects[0];
  if (!firstProject || !preferences) return null;

  const projectMap = preferences.project_map;
  // A project key is either a Jira issue-key prefix (e.g. "ABC-123" → "ABC")
  // or a favorite's custom key. Normalize to uppercase so lookups can't miss
  // on casing (favorite keys are normalized the same way).
  const trimmedKey = key.trim().toUpperCase();
  const selectedProject = projectId ?? firstProject.value;
  const distinctValues = new Set([
    ...Object.values(projectMap),
    selectedProject,
  ]);
  const canAdd = Boolean(
    trimmedKey &&
      !(trimmedKey in projectMap) &&
      distinctValues.size <= MAX_DISTINCT_PROJECTS,
  );

  function projectLabel(value: string) {
    return data?.projects.find((p) => p.value === value)?.label ?? value;
  }

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canAdd || !preferences) return;
    savePreferences.mutate({
      ...preferences,
      project_map: { ...projectMap, [trimmedKey]: selectedProject },
    });
    setKey("");
    setProjectId(null);
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Label className="flex flex-none items-center gap-1">
        Project mapping
        <Tooltip>
          <TooltipTrigger
            render={
              <span>
                <InfoIcon size={16} className="inline" />
              </span>
            }
          />
          <TooltipContent>
            Maps project keys to the portal's projects — an issue's key is its
            Jira key prefix (ABC-123 → ABC), a favorite's is its own optional
            key. Selected tasks are grouped by portal project and each group
            fills its own project + comment pair in the task form, largest group
            first (max {MAX_DISTINCT_PROJECTS} portal projects — the form has{" "}
            {MAX_DISTINCT_PROJECTS} pairs). Unmapped tasks fall back to the
            default project's group, or the first comment when no default
            project is set.
          </TooltipContent>
        </Tooltip>
      </Label>
      {Object.keys(projectMap).length > 0 && (
        <ul ref={listRef} className="flex w-full flex-col">
          {Object.entries(projectMap).map(([projectKey, portalProject]) => (
            <li key={projectKey} className="flex items-center gap-2 text-sm">
              <span className="font-mono">{projectKey}</span>
              <MoveRightIcon className="size-4 flex-none text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {projectLabel(portalProject)}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => {
                  const { [projectKey]: _removed, ...rest } = projectMap;
                  savePreferences.mutate({ ...preferences, project_map: rest });
                }}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} className="flex w-full items-center gap-2">
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Project key"
          className="w-30 flex-none font-mono"
        />
        <Select
          items={data.projects}
          value={selectedProject}
          onValueChange={(val) => setProjectId(val ?? firstProject.value)}
        >
          <SelectTrigger className="min-w-0 flex-1">
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
        <Button type="submit" size="icon" disabled={!canAdd}>
          <PlusIcon />
        </Button>
      </form>
    </div>
  );
}
