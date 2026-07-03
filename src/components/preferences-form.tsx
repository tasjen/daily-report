import { Settings2Icon } from "lucide-react";
import DefaultProjectSelect from "@/components/default-project-select";
import DefaultTaskGroupsSelect from "@/components/default-task-groups-select";
import { ProjectListSelect } from "@/components/project-list-select";
import { Button } from "@/components/shared/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shared/dialog";
import ThemeToggle from "@/components/theme-toggle";

export default function PreferencesForm() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="icon-xl" variant="ghost">
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
        <div className="flex flex-col gap-4">
          <DefaultProjectSelect />
          <ProjectListSelect />
          <DefaultTaskGroupsSelect />
          <ThemeToggle />
        </div>
      </DialogContent>
    </Dialog>
  );
}
