import { LazyStore } from "@tauri-apps/plugin-store";

// Schema of store.json. The Rust backend reads the same keys
// (src-tauri/src/lib.rs), so field names must stay in sync.
export type Account = {
  phone: string;
  email: string;
  api_token: string;
};

// Free-form favorite tasks, insertion-ordered. Frontend-only: the Rust side
// never reads this key. The text itself is the identity — the favorites
// dialog rejects duplicates, so no generated ids.
export type Favorites = string[];

export type TaskGroupType = "status" | "created" | "sprint" | "favorite";

export type Preferences = {
  default_project: string | null;
  project_list: string[];
  default_task_groups: TaskGroupType[];
  autofill_summary: boolean;
  auto_submit: boolean;
  auto_close: boolean;
};

// Fallback merged under whatever is persisted, so preferences saved before a
// field existed still come back with that field populated.
export const DEFAULT_PREFERENCES: Preferences = {
  default_project: null,
  project_list: [],
  default_task_groups: ["status"],
  autofill_summary: true,
  auto_submit: false,
  auto_close: false,
};

export const store = new LazyStore("store.json");
