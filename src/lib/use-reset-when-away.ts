import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { relaunch } from "@tauri-apps/plugin-process";
import { useEffect, useRef } from "react";

const IDLE_RESET_MS = 60 * 60 * 1000; // 1 hour unfocused → reset on return

/**
 * Resets the app "as if restarted" when the window has been unfocused
 * (minimized or switched away from) for at least {@link IDLE_RESET_MS} and is
 * then focused again — without closing/reopening the OS window (unlike
 * `relaunch()`). Tears down both browser sessions so the next command relaunches
 * fresh, then reloads the webview to rebuild all UI/react-query state from
 * `store.json` + the backend.
 */
export function useResetWhenAway() {
  const blurredAt = useRef<number | null>(null);
  const isResetting = useRef(false);

  useEffect(() => {
    let cleanedUp = false;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          // First blur wins: a spurious re-blur (e.g. a lock-screen
          // transition just before the user returns) must not shrink the
          // measured away time.
          blurredAt.current ??= Date.now();
          return;
        }
        const since = blurredAt.current;
        blurredAt.current = null;
        if (since === null || isResetting.current) return;
        if (Date.now() - since < IDLE_RESET_MS) return;

        isResetting.current = true;
        // Reload only after teardown settles, so the reloaded frontend's
        // first get_task_parameters starts against a clean backend. If the
        // teardown call itself fails, backend state is unknown — relaunch the
        // whole process, and only if that also fails reload as a best effort.
        invoke("close_browsers").then(
          () => window.location.reload(),
          () => relaunch().catch(() => window.location.reload()),
        );
      })
      .then((fn) => {
        // The listener registers async; if the effect was cleaned up before
        // the promise resolved, unregister immediately instead of leaking.
        if (cleanedUp) fn();
        else unlisten = fn;
      })
      .catch(console.error);
    return () => {
      cleanedUp = true;
      unlisten?.();
    };
  }, []);
}
