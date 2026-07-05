import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/App.css";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ErrorBoundary } from "react-error-boundary";
import ErrorFallback from "@/components/error-fallback";
import { TooltipProvider } from "@/components/shared/tooltip";
import { ThemeProvider } from "@/components/theme-provider";

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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ShowWindowOnMount>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider storageKey="vite-ui-theme">
            <TooltipProvider>
              <App />
            </TooltipProvider>
          </ThemeProvider>
          <ReactQueryDevtools />
        </QueryClientProvider>
      </ErrorBoundary>
    </ShowWindowOnMount>
  </React.StrictMode>,
);
