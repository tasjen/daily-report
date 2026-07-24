import { expect, it } from "vitest";

import { store } from "@/lib/store";
import { mockTauri } from "@/test/tauri";

it("reads store values through the Tauri IPC mock", async () => {
  mockTauri({ preferences: { default_project: "42" } });
  await expect(store.get("preferences")).resolves.toEqual({
    default_project: "42",
  });
  await expect(store.get("missing-key")).resolves.toBeUndefined();
});
