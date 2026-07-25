import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import ErrorFallback from "@/components/error-fallback";
import { activateLocale } from "@/lib/i18n";

const { relaunch } = vi.hoisted(() => ({
  relaunch: vi.fn<() => Promise<void>>(),
}));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch }));

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
  // heading is translated copy (testid); the message is the error itself (text)
  expect(screen.getByTestId("error-title")).toBeInTheDocument();
  expect(screen.getByText("Error: boom")).toBeInTheDocument();
  // nothing to report until Restart is clicked and actually fails
  expect(screen.queryByTestId("relaunch-error")).not.toBeInTheDocument();
});

// A toast can't carry this: the fallback replaces the App tree, so <Toaster />
// is gone. The message has to land in the fallback itself.
it("shows a failed relaunch in the fallback", async () => {
  await activateLocale("en");
  relaunch.mockRejectedValueOnce(new Error("no restart"));
  render(
    <I18nProvider i18n={i18n}>
      <ErrorFallback
        error={new Error("boom")}
        resetErrorBoundary={() => undefined}
      />
    </I18nProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Restart app" }));
  expect(await screen.findByTestId("relaunch-error")).toHaveTextContent(
    "Error: no restart",
  );
});
