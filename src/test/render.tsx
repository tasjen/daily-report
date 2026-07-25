import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";

import { TooltipProvider } from "@/components/shared/tooltip";
import { activateLocale } from "@/lib/i18n";

// Mirrors main.tsx's query defaults (staleTime Infinity, no focus refetch);
// retry stays off so failing queries fail the test immediately. TooltipProvider
// is mirrored too — it carries the app's `delay = 0`, and without it a hovered
// tooltip waits out base-ui's default delay before it can be asserted on.
export async function renderWithProviders(ui: React.ReactElement) {
  await activateLocale("en");
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider i18n={i18n}>
        <TooltipProvider>{ui}</TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}
