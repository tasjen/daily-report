import { Settings2Icon } from "lucide-react";
import { Button } from "@/components/shared/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/shared/dialog";
import DefaultProjectSelect from "./default-project-select";
import { ProjectListSelect } from "./project-list-select";
import ThemeSelect from "./theme-select";

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
          <ThemeSelect />
        </div>
      </DialogContent>
    </Dialog>
  );
}
