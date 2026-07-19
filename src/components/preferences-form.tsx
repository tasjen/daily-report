import { Settings2Icon } from "lucide-react";
import AutoCloseToggle from "@/components/auto-close-toggle";
import AutoSubmitToggle from "@/components/auto-submit-toggle";
import AutofillSummaryToggle from "@/components/autofill-summary-toggle";
import DefaultProjectSelect from "@/components/default-project-select";
import DefaultTaskGroupsSelect from "@/components/default-task-groups-select";
import { ProjectListSelect } from "@/components/project-list-select";
import ProjectMapForm from "@/components/project-map-form";
import { Button } from "@/components/shared/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shared/dialog";
import { Separator } from "@/components/shared/separator";
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
      <DialogContent initialFocus={false} className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2Icon />
            Preferences
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-4">
          <div className="flex flex-col gap-4">
            <DefaultProjectSelect />
            <ProjectListSelect />
            <ProjectMapForm />
            <DefaultTaskGroupsSelect />
          </div>
          <Separator orientation="vertical" />
          <div className="flex flex-none flex-col gap-4">
            <AutofillSummaryToggle />
            <AutoSubmitToggle />
            <AutoCloseToggle />
            <ThemeToggle />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
