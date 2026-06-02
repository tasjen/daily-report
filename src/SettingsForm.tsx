import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/shared/button";
import { Label } from "@/components/shared/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/shared/dialog";
import { Input } from "./components/shared/input";
import DefaultProjectSelect from "./DefaultProjectSelect";
import { taskParametersOptions } from "./lib/queries";
import { type GlobalState, useGlobalState } from "./store";

export default function SettingsForm() {
  const store = useGlobalState((state) => state.store);
  const settings = useGlobalState((state) => state.settings);
  const setSettings = useGlobalState((state) => state.setSettings);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [defaultProject, setDefaultProject] = useState<string | null>(null);
  const [open, setOpen] = useState(!settings);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open || !settings) return;
    setPhone(settings.phone);
    setEmail(settings.email);
    setApiToken(settings.api_token);
    setDefaultProject(settings.default_project);
  }, [open]);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const newSettings: GlobalState["settings"] = {
      phone,
      email,
      api_token: apiToken,
      default_project: defaultProject ?? "",
    };
    await store.set("settings", newSettings);
    await store.save();
    setOpen(false);
    if (settings) {
      await invoke("reset_browser");
    }
    await queryClient.invalidateQueries(taskParametersOptions());
    setSettings(newSettings);
  }

  const isTaskParametersQuerySuccess =
    queryClient.getQueryState(taskParametersOptions().queryKey)?.status ===
    "success";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="icon-lg"
            className="absolute bottom-2 right-2"
            variant="ghost"
          >
            <Settings />
          </Button>
        }
      />
      <DialogContent initialFocus={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings />
            Settings
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Label className="flex flex-col gap-2 items-start">
            <p className="flex-none">Phone number</p>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </Label>
          <Label className="flex flex-col gap-2 items-start">
            <p className="flex-none">Jira email</p>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Label>
          <Label className="flex flex-col gap-2 items-start">
            <p className="flex-none flex items-center gap-1">
              Jira API token{" "}
              <Button
                size="icon-xs"
                type="button"
                variant="link"
                nativeButton={false}
                onClick={() => {
                  openUrl(
                    "https://id.atlassian.com/manage-profile/security/api-tokens",
                  );
                }}
                render={
                  <span>
                    <ExternalLink size={16} className="inline" />
                  </span>
                }
              />
            </p>
            <Input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              onFocus={(e) => (e.currentTarget.type = "text")}
              onBlur={(e) => (e.currentTarget.type = "password")}
              required
            />
          </Label>
          {settings && isTaskParametersQuerySuccess && (
            <Label className="flex flex-col gap-2 items-start">
              <p className="flex-none flex items-center gap-1">
                Default project{" "}
              </p>

              <DefaultProjectSelect
                value={defaultProject}
                onValueChange={setDefaultProject}
              />
            </Label>
          )}
          <Button type="submit">Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
