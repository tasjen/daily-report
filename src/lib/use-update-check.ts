import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
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
        const version = update.version;
        toast.info(i18n._(msg`Update available: v${version}`), {
          duration: Number.POSITIVE_INFINITY,
          closeButton: true,
          action: {
            label: i18n._(msg`Update & restart`),
            onClick: () => {
              // On Windows the NSIS installer exits the app itself before
              // relaunch() is reached; the relaunch matters on macOS.
              toast.promise(update.downloadAndInstall().then(relaunch), {
                loading: i18n._(msg`Downloading update…`),
                success: i18n._(msg`Restarting…`),
                error: (error) => i18n._(msg`Update failed: ${String(error)}`),
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
