import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLinkIcon, UserCogIcon } from "lucide-react";
import { useEffect, useState } from "react";
import ResetAppButton from "@/components/reset-app-button";
import { Button } from "@/components/shared/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shared/dialog";
import { Input } from "@/components/shared/input";
import { Label } from "@/components/shared/label";
import SpanRequired from "@/components/shared/span-required";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shared/tooltip";
import { taskParametersOptions } from "@/lib/queries";
import { store } from "@/lib/store";
import { type GlobalState, useGlobalState } from "@/store";

const jiraTokenUrl =
  "https://id.atlassian.com/manage-profile/security/api-tokens";

export default function AccountForm() {
  const account = useGlobalState((state) => state.account);
  const setAccount = useGlobalState((state) => state.setAccount);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [open, setOpen] = useState(!account);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open || !account) return;
    setPhone(account.phone);
    setEmail(account.email);
    setApiToken(account.api_token);
  }, [open]);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const newAccount: GlobalState["account"] = {
      phone,
      email,
      api_token: apiToken,
    };
    await store.set("account", newAccount);
    await store.save();
    setOpen(false);
    if (account) {
      await invoke("close_headless_browser");
    }
    await queryClient.invalidateQueries(taskParametersOptions());
    setAccount(newAccount);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="icon-xl" variant="ghost">
            <UserCogIcon className="size-6" />
          </Button>
        }
      />
      <DialogContent initialFocus={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCogIcon />
            Account
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Label className="flex flex-col gap-2 items-start">
            <p className="flex-none">
              Phone number <SpanRequired />
            </p>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </Label>
          <Label className="flex flex-col gap-2 items-start">
            <p className="flex-none">
              Jira email <SpanRequired />
            </p>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Label>
          <Label className="flex flex-col gap-2 items-start">
            <p className="flex-none flex items-center gap-1">
              Jira API token <SpanRequired />
              <Tooltip>
                <TooltipTrigger
                  className="cursor-pointer"
                  onClick={() => openUrl(jiraTokenUrl)}
                  render={
                    <span>
                      <ExternalLinkIcon size={16} className="inline" />
                    </span>
                  }
                />
                <TooltipContent className="max-w-none">
                  <p
                    className="cursor-pointer font-semibold hover:underline"
                    onClick={() => openUrl(jiraTokenUrl)}
                  >
                    {jiraTokenUrl}
                  </p>
                </TooltipContent>
              </Tooltip>
            </p>
            <Input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              required
            />
          </Label>
          <DialogFooter>
            <ResetAppButton />
            <Button type="submit" className="flex-1">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
