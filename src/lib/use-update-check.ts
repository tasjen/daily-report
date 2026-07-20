import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useEffect } from "react";
import { toast } from "sonner";

export function useUpdateCheck() {
  useEffect(() => {
    if (import.meta.env.DEV) {
      return;
    }
    check()
      .then((update) => {
        if (!update) {
          return;
        }
        toast.info(`Update available: v${update.version}`, {
          duration: Number.POSITIVE_INFINITY,
          action: {
            label: "Update & restart",
            onClick: () => {
              // On Windows the NSIS installer exits the app itself before
              // relaunch() is reached; the relaunch matters on macOS.
              toast.promise(update.downloadAndInstall().then(relaunch), {
                loading: "Downloading update…",
                success: "Restarting…",
                error: (e) => `Update failed: ${e}`,
                closeButton: true,
              });
            },
          },
        });
      })
      .catch(() => {
        // Offline or the release endpoint is unreachable — a launch-time
        // update check is not worth surfacing errors for.
      });
  }, []);
}
