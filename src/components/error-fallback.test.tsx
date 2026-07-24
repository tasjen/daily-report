import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import ErrorFallback from "@/components/error-fallback";
import { activateLocale } from "@/lib/i18n";

it("renders the error message", async () => {
  await activateLocale("en");
  render(
    <I18nProvider i18n={i18n}>
      <ErrorFallback
        error={new Error("boom")}
        resetErrorBoundary={() => undefined}
      />
    </I18nProvider>,
  );
  expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  expect(screen.getByText("Error: boom")).toBeInTheDocument();
});
