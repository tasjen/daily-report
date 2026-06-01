import { ComponentProps, useEffect, useState } from "react";
import { useStore } from "@/App";
import { Label } from "@/components/shared/label";
import { Button } from "@/components/shared/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/shared/dialog";
import { Input } from "./components/shared/input";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Settings } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

type Props = ComponentProps<typeof Dialog> & {
  onSave: () => void;
};

export default function SettingsForm({ onSave, ...props }: Props) {
  const store = useStore();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [open, setOpen] = useState(props.defaultOpen);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [phone, email, apiToken] = await Promise.all([
        store.get<string>("phone"),
        store.get<string>("email"),
        store.get<string>("api_token"),
      ]);
      setPhone(phone ?? "");
      setEmail(email ?? "");
      setApiToken(apiToken ?? "");
    })();
  }, [open]);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    await Promise.all([
      store.set("phone", phone),
      store.set("email", email),
      store.set("api_token", apiToken),
    ]);
    await store.save();
    onSave();
    setOpen(false);
    await queryClient.invalidateQueries({ queryKey: ["dateOptions"] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen} {...props}>
      <DialogTrigger
        render={
          <Button size="icon-lg" className="absolute bottom-2 right-2" variant="ghost">
            <Settings />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
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
            <p className="flex-none flex items-center gap-2">
              Jira API token{" "}
              <span
                onClick={() =>
                  openUrl(
                    "https://id.atlassian.com/manage-profile/security/api-tokens",
                  )
                }
              >
                <ExternalLink size={16} className="inline" />
              </span>
            </p>
            <Input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              required
            />
          </Label>
          <Button type="submit">Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
