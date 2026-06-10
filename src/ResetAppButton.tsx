import { relaunch } from "@tauri-apps/plugin-process";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./components/shared/button";
import { useGlobalState } from "./store";

export default function ResetAppButton() {
  const store = useGlobalState((state) => state.store);
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
      {isLoading ? <Loader2 className="animate-spin" /> : "Reset"}
    </Button>
  );
}
