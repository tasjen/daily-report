import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import AutoCloseToggle from "@/components/auto-close-toggle";
import AutoSubmitToggle from "@/components/auto-submit-toggle";
import AutofillSummaryToggle from "@/components/autofill-summary-toggle";
import type { Preferences } from "@/lib/store";
import { renderWithProviders } from "@/test/render";
import { mockTauri } from "@/test/tauri";

// Auto-fill → auto-submit → auto-close is a cascade, not just a disabled
// chain: a parent turning off *saves* its children off. That is what keeps
// store.json internally consistent, so the Rust side can read auto_submit and
// auto_close directly instead of re-deriving the chain — and what stops
// re-enabling a parent from silently re-arming an auto-submit the user
// disarmed long ago.
//
// The three toggles are separate components sharing one preferences cache, so
// they render together here: the cascade is the rule that emerges between
// them, not anything one of them does alone. Switches are addressed by
// data-testid — their labels are lingui messages.
async function setup(preferences: Partial<Preferences>) {
  const saved: Preferences[] = [];
  mockTauri({ preferences }, (cmd, args) => {
    if (cmd === "plugin:store|set") {
      saved.push((args as { value: Preferences }).value);
    }
    return undefined;
  });
  await renderWithProviders(
    <>
      <AutofillSummaryToggle />
      <AutoSubmitToggle />
      <AutoCloseToggle />
    </>,
  );
  await screen.findByTestId("autofill-summary-toggle");
  return saved;
}

const ALL_ARMED = {
  autofill_summary: true,
  auto_submit: true,
  auto_close: true,
};

it("turning auto-fill off saves both dependants off, not merely hides them", async () => {
  const saved = await setup(ALL_ARMED);

  await userEvent.click(screen.getByTestId("autofill-summary-toggle"));

  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    autofill_summary: false,
    auto_submit: false,
    auto_close: false,
  });
});

it("turning auto-submit off saves auto-close off but leaves auto-fill alone", async () => {
  const saved = await setup(ALL_ARMED);

  await userEvent.click(screen.getByTestId("auto-submit-toggle"));

  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    autofill_summary: true,
    auto_submit: false,
    auto_close: false,
  });
});

it("re-enabling a parent leaves its children disarmed", async () => {
  // The safety property: the app never auto-submits unless the user just
  // armed it, however the preferences got into this state.
  const saved = await setup({
    autofill_summary: false,
    auto_submit: false,
    auto_close: false,
  });

  await userEvent.click(screen.getByTestId("autofill-summary-toggle"));

  expect(saved[0]).toMatchObject({
    autofill_summary: true,
    auto_submit: false,
    auto_close: false,
  });
});

it("disables each toggle whose parent is off", async () => {
  await setup({
    autofill_summary: false,
    auto_submit: false,
    auto_close: false,
  });

  // base-ui renders a span with role="switch", not a form control, so the
  // disabled state is only readable as aria-disabled.
  expect(screen.getByTestId("auto-submit-toggle")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.getByTestId("auto-close-toggle")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});
