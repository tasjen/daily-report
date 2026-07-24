import { Trans } from "@lingui/react/macro";
import { relaunch } from "@tauri-apps/plugin-process";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/shared/button";
import { store } from "@/lib/store";

export default function SignOutButton() {
  const [isLoading, setIsLoading] = useState(false);
  return (
    <Button
      type="button"
      disabled={isLoading}
      variant="destructive"
      onClick={async () => {
        if (import.meta.env.DEV) return;
        setIsLoading(true);
        try {
          await store.clear();
          await relaunch();
        } catch (error) {
          toast.error(String(error));
        }
        setIsLoading(false);
      }}
    >
      {isLoading ? (
        <Loader2Icon className="animate-spin" />
      ) : (
        <Trans>Sign out</Trans>
      )}
    </Button>
  );
}
