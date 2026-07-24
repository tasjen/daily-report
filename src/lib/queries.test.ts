import { describe, expect, it } from "vitest";

import { favoritesOptions, preferencesOptions } from "@/lib/queries";
import {
  DEFAULT_PREFERENCES,
  type Favorite,
  type Preferences,
} from "@/lib/store";
import { mockTauri } from "@/test/tauri";

// The queryFns ignore their react-query context argument, so call them bare.
const readPreferences = () =>
  (preferencesOptions().queryFn as () => Promise<Preferences>)();
const readFavorites = () =>
  (favoritesOptions().queryFn as () => Promise<Favorite[]>)();

describe("preferencesOptions", () => {
  it("returns full defaults when no preferences were ever saved", async () => {
    mockTauri({});
    await expect(readPreferences()).resolves.toEqual(DEFAULT_PREFERENCES);
  });

  it("merges stored values over defaults field-by-field, upgrading old stores", async () => {
    // A store saved before project_map/auto_close existed: only some fields.
    mockTauri({
      preferences: { default_project: "42", autofill_summary: false },
    });
    await expect(readPreferences()).resolves.toEqual({
      ...DEFAULT_PREFERENCES,
      default_project: "42",
      autofill_summary: false,
    });
  });
});

describe("favoritesOptions", () => {
  it("returns an empty list when the key predates the store", async () => {
    mockTauri({});
    await expect(readFavorites()).resolves.toEqual([]);
  });

  it("normalizes legacy string favorites and passes objects through", async () => {
    mockTauri({
      favorites: ["Standup", { text: "Deploy", project_key: "OPS" }],
    });
    await expect(readFavorites()).resolves.toEqual([
      { text: "Standup", project_key: null },
      { text: "Deploy", project_key: "OPS" },
    ]);
  });
});
