import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import FavoritesForm from "@/components/favorites-form";
import type { Favorite } from "@/lib/store";
import { renderWithProviders } from "@/test/render";
import { mockTauri } from "@/test/tauri";

function setup(favorites: (string | Favorite)[]) {
  const saved: Favorite[][] = [];
  mockTauri({ favorites }, (cmd, args) => {
    if (cmd === "plugin:store|set") {
      saved.push((args as { value: Favorite[] }).value);
    }
    return undefined;
  });
  return saved;
}

// Elements are queried by data-testid, never by their rendered copy: every
// visible string here goes through lingui, so a message or catalog edit would
// otherwise break the test. Favorite text and project keys are user data, not
// copy, so those stay asserted by text.
async function openDialog() {
  await renderWithProviders(<FavoritesForm />);
  await userEvent.click(screen.getByTestId("favorites-open"));
  return await screen.findByTestId("favorite-text");
}

it("lists stored favorites and disables add for blank and duplicate text", async () => {
  setup([{ text: "Standup", project_key: "OPS" }]);
  const textInput = await openDialog();
  expect(screen.getByText("Standup")).toBeInTheDocument();
  expect(screen.getByText("OPS")).toBeInTheDocument();

  expect(screen.getByTestId("favorite-add")).toBeDisabled();
  await userEvent.type(textInput, "  Standup  ");
  expect(screen.getByTestId("favorite-add")).toBeDisabled();
});

it("adds a favorite with a trimmed text and uppercased project key", async () => {
  const saved = setup([]);
  const textInput = await openDialog();
  await userEvent.type(textInput, "  Deploy  ");
  await userEvent.type(screen.getByTestId("favorite-key"), "ops");
  await userEvent.click(screen.getByTestId("favorite-add"));
  expect(saved).toEqual([[{ text: "Deploy", project_key: "OPS" }]]);
});

it("deletes a favorite by saving the remaining list", async () => {
  const saved = setup([
    { text: "Standup", project_key: null },
    { text: "Deploy", project_key: "OPS" },
  ]);
  await openDialog();
  const deleteButtons = screen.getAllByTestId("favorite-delete");
  expect(deleteButtons).toHaveLength(2);
  await userEvent.click(deleteButtons[0]!);
  expect(saved).toEqual([[{ text: "Deploy", project_key: "OPS" }]]);
});
