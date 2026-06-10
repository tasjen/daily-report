import { Settings2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/shared/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/shared/dialog";
import { Label } from "./components/shared/label";
import DefaultProjectSelect from "./default-project-select";
import { useTaskParameters } from "./lib/queries";
import { ProjectListSelect } from "./project-list-select";
import { type GlobalState, useGlobalState } from "./store";
import ThemeToggle from "./theme-toggle";

export default function PreferencesForm() {
  const store = useGlobalState((state) => state.store);
  const preferences = useGlobalState((state) => state.preferences);
  const setPreferences = useGlobalState((state) => state.setPreferences);
  const [defaultProject, setDefaultProject] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  const { data } = useTaskParameters();

  useEffect(() => {
    if (!open) return;
    setDefaultProject(
      preferences?.default_project ?? data?.projects[0]?.value ?? null,
    );
    setProjectList(preferences?.project_list ?? []);
  }, [open]);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const newPreferences: GlobalState["preferences"] = {
      default_project: defaultProject,
      project_list: projectList ?? [],
    };
    await store.set("preferences", newPreferences);
    await store.save();
    setOpen(false);
    setPreferences(newPreferences);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="icon-xl"
            variant="ghost"
            className="not-hover:text-ring"
          >
            <Settings2Icon className="size-6" />
          </Button>
        }
      />
      <DialogContent initialFocus={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2Icon />
            Preferences
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DefaultProjectSelect
            value={defaultProject}
            onValueChange={setDefaultProject}
          />
          <ProjectListSelect
            value={projectList}
            onValueChange={setProjectList}
          />
          <div className="flex gap-2">
            <Label>Theme</Label>
            <ThemeToggle />
          </div>
          <Button type="submit">Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
