import { Trans } from "@lingui/react/macro";
import { relaunch } from "@tauri-apps/plugin-process";
import type { FallbackProps } from "react-error-boundary";

import { Button } from "@/components/shared/button";

export default function ErrorFallback({
  error,
  resetErrorBoundary,
}: FallbackProps) {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">
        <Trans>Something went wrong</Trans>
      </h1>
      <p className="max-w-2xl text-center whitespace-pre-wrap text-red-500">
        {String(error)}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={resetErrorBoundary}>
          <Trans>Try again</Trans>
        </Button>
        <Button onClick={() => relaunch()}>
          <Trans>Restart app</Trans>
        </Button>
      </div>
    </main>
  );
}
