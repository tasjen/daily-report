import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import ProjectMapForm from "@/components/project-map-form";
import type { Preferences } from "@/lib/store";
import { renderWithProviders } from "@/test/render";
import { mockTauri } from "@/test/tauri";

function setup(
  projects: { label: string; value: string }[],
  projectMap: Record<string, string>,
) {
  const saved: Preferences[] = [];
  // useTaskParameters is enabled only when an account exists.
  const account = { phone: "0812345678" };
  mockTauri(
    { account, preferences: { project_map: projectMap } },
    (cmd, args) => {
      if (cmd === "get_task_parameters") {
        return { dates: [], leaves: [], projects };
      }
      if (cmd === "plugin:store|set") {
        saved.push((args as { value: Preferences }).value);
      }
      return undefined;
    },
  );
  return saved;
}

// Queried by data-testid, not by the translated placeholder/label copy.
async function renderForm() {
  await renderWithProviders(<ProjectMapForm />);
  return await screen.findByTestId("project-map-key");
}

function submitButton() {
  return screen.getByTestId("project-map-add");
}

async function selectProject(value: string) {
  await userEvent.click(screen.getByTestId("project-map-project"));
  await userEvent.click(
    await screen.findByTestId(`project-map-option-${value}`),
  );
}

it("adds a mapping with the key trimmed and uppercased", async () => {
  const saved = setup([{ label: "Alpha", value: "1" }], {});
  const keyInput = await renderForm();
  await userEvent.type(keyInput, "  dr  ");
  await selectProject("1");
  await userEvent.click(submitButton());
  expect(saved).toHaveLength(1);
  expect(saved[0]!.project_map).toEqual({ DR: "1" });
});

it("disables add until a project is picked", async () => {
  setup([{ label: "Alpha", value: "1" }], {});
  const keyInput = await renderForm();
  await userEvent.type(keyInput, "dr");
  expect(submitButton()).toBeDisabled();
  await selectProject("1");
  expect(submitButton()).toBeEnabled();
});

// The portal keeps its empty-valued placeholder option, which Base UI would
// otherwise treat as no selection at all.
it("treats an empty-valued option as a real selection", async () => {
  const saved = setup(
    [
      { label: "No project", value: "" },
      { label: "Alpha", value: "1" },
    ],
    {},
  );
  const keyInput = await renderForm();
  const trigger = screen.getByTestId("project-map-project");
  expect(trigger).not.toHaveTextContent("No project");
  await userEvent.type(keyInput, "dr");
  await selectProject("");
  expect(trigger).toHaveTextContent("No project");
  await userEvent.click(submitButton());
  expect(saved[0]!.project_map).toEqual({ DR: "" });
});

it("rejects a duplicate key regardless of casing", async () => {
  setup([{ label: "Alpha", value: "1" }], { DR: "1" });
  const keyInput = await renderForm();
  expect(submitButton()).toBeDisabled();
  await userEvent.type(keyInput, "dr");
  expect(submitButton()).toBeDisabled();
});

it("disables add when it would exceed 3 distinct portal projects", async () => {
  // "Delta" ("4") would be a 4th distinct portal project beyond the map's
  // existing three.
  setup(
    [
      { label: "Delta", value: "4" },
      { label: "Alpha", value: "1" },
    ],
    { A: "1", B: "2", C: "3" },
  );
  const keyInput = await renderForm();
  await userEvent.type(keyInput, "D");
  await selectProject("4");
  expect(submitButton()).toBeDisabled();
});

it("allows a new key that reuses an already-mapped portal project", async () => {
  const saved = setup([{ label: "Alpha", value: "1" }], {
    A: "1",
    B: "2",
    C: "3",
  });
  const keyInput = await renderForm();
  await userEvent.type(keyInput, "D");
  await selectProject("1");
  await userEvent.click(submitButton());
  expect(saved).toHaveLength(1);
  expect(saved[0]!.project_map).toEqual({ A: "1", B: "2", C: "3", D: "1" });
});
