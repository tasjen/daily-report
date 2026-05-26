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
        className="float-end"
        render={<Button className="float-end">Config</Button>}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Config</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Label>
            <p className="flex-none">Phone number</p>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </Label>
          <Label>
            <p className="flex-none">Email</p>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Label>
          <Label>
            <p className="flex-none">Jira API token</p>
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
