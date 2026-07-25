import { Trans } from "@lingui/react/macro";
import { relaunch } from "@tauri-apps/plugin-process";
import { useState } from "react";
import type { FallbackProps } from "react-error-boundary";

import { Button } from "@/components/shared/button";

export default function ErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  // A failed relaunch can't be reported with a toast: this fallback replaces
  // the App tree, so <Toaster /> is unmounted. Render it here instead, or the
  // click would look like it did nothing.
  const [relaunchError, setRelaunchError] = useState<string | null>(null);

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold" data-testid="error-title">
        <Trans>Something went wrong</Trans>
      </h1>
      <p className="max-w-2xl text-center whitespace-pre-wrap text-red-500">
        {String(error)}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={resetErrorBoundary}>
          <Trans>Try again</Trans>
        </Button>
        <Button
          onClick={() => {
            setRelaunchError(null);
            relaunch().catch((reason: unknown) =>
              setRelaunchError(String(reason)),
            );
          }}
        >
          <Trans>Restart app</Trans>
        </Button>
      </div>
      {relaunchError !== null && (
        <p
          className="max-w-2xl text-center whitespace-pre-wrap text-red-500"
          data-testid="relaunch-error"
        >
          <Trans>Restart failed:</Trans> {relaunchError}
        </p>
      )}
    </main>
  );
}
