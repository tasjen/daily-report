import { LazyStore } from "@tauri-apps/plugin-store";

// Schema of store.json. The Rust backend reads the same keys
// (src-tauri/src/lib.rs), so field names must stay in sync.
export type Account = {
  phone: string;
  email: string;
  api_token: string;
};

export type TaskGroupType = "status" | "created" | "sprint";

export type Preferences = {
  default_project: string | null;
  project_list: string[];
  default_task_groups: TaskGroupType[];
  autofill_summary: boolean;
};

// Fallback merged under whatever is persisted, so preferences saved before a
// field existed still come back with that field populated.
export const DEFAULT_PREFERENCES: Preferences = {
  default_project: null,
  project_list: [],
  default_task_groups: ["status"],
  autofill_summary: true,
};

export const store = new LazyStore("store.json");
