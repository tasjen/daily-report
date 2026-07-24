import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { getCurrentWindow } from "@tauri-apps/api/window";

import "@/App.css";
import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";

import App from "@/App";
import ErrorFallback from "@/components/error-fallback";
import { TooltipProvider } from "@/components/shared/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { activateLocale, getStoredLocale } from "@/lib/i18n";

// The window is created hidden (`visible: false` in tauri.conf.json) so it
// never appears before the UI has rendered. This must stay the outermost
// component: parent effects run after child effects, so by the time show()
// fires, ThemeProvider has already applied the theme class.
function ShowWindowOnMount({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const appWindow = getCurrentWindow();
    appWindow
      .show()
      .then(() => appWindow.setFocus())
      .catch(console.error);
  }, []);
  return children;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      refetchOnMount: true,
    },
  },
});
// Activate before render so the first paint (the window is still hidden until
// ShowWindowOnMount) never flashes untranslated message ids.
await activateLocale(getStoredLocale());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ShowWindowOnMount>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <I18nProvider i18n={i18n}>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider storageKey="vite-ui-theme">
              <TooltipProvider>
                <App />
              </TooltipProvider>
            </ThemeProvider>
            <ReactQueryDevtools />
          </QueryClientProvider>
        </I18nProvider>
      </ErrorBoundary>
    </ShowWindowOnMount>
  </React.StrictMode>,
);
