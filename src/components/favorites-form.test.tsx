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

async function openDialog() {
  await renderWithProviders(<FavoritesForm />);
  await userEvent.click(screen.getByRole("button"));
  return await screen.findByPlaceholderText("Add a favorite task");
}

it("lists stored favorites and disables add for blank and duplicate text", async () => {
  setup([{ text: "Standup", project_key: "OPS" }]);
  const textInput = await openDialog();
  expect(screen.getByText("Standup")).toBeInTheDocument();
  expect(screen.getByText("OPS")).toBeInTheDocument();

  const submit = screen
    .getAllByRole("button")
    .find((b) => b.getAttribute("type") === "submit")!;
  expect(submit).toBeDisabled();
  await userEvent.type(textInput, "  Standup  ");
  expect(submit).toBeDisabled();
});

it("adds a favorite with a trimmed text and uppercased project key", async () => {
  const saved = setup([]);
  const textInput = await openDialog();
  await userEvent.type(textInput, "  Deploy  ");
  await userEvent.type(screen.getByPlaceholderText("Project key"), "ops");
  const submit = screen
    .getAllByRole("button")
    .find((b) => b.getAttribute("type") === "submit")!;
  await userEvent.click(submit);
  expect(saved).toEqual([[{ text: "Deploy", project_key: "OPS" }]]);
});

it("deletes a favorite by saving the remaining list", async () => {
  const saved = setup([
    { text: "Standup", project_key: null },
    { text: "Deploy", project_key: "OPS" },
  ]);
  await openDialog();
  const deleteButtons = screen
    .getAllByRole("button")
    .filter((b) => b.querySelector("svg.lucide-trash-2"));
  expect(deleteButtons).toHaveLength(2);
  await userEvent.click(deleteButtons[0]!);
  expect(saved).toEqual([[{ text: "Deploy", project_key: "OPS" }]]);
});
