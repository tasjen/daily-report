import { Trans } from "@lingui/react/macro";
import { relaunch } from "@tauri-apps/plugin-process";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/shared/button";
import { store } from "@/lib/store";
import { toastError } from "@/lib/utils";

export default function SignOutButton() {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSignOut() {
    if (import.meta.env.DEV) return;
    setIsLoading(true);
    try {
      await store.clear();
      await relaunch();
    } catch (error) {
      toastError(error);
    }
    setIsLoading(false);
  }

  return (
    <Button
      type="button"
      disabled={isLoading}
      variant="destructive"
      onClick={() => void handleSignOut()}
    >
      {isLoading ? (
        <Loader2Icon className="animate-spin" />
      ) : (
        <Trans>Sign out</Trans>
      )}
    </Button>
  );
}
