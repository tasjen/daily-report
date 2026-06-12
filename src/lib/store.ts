import { LazyStore } from "@tauri-apps/plugin-store";

// Schema of store.json. The Rust backend reads the same keys
// (src-tauri/src/lib.rs), so field names must stay in sync.
export type Account = {
  phone: string;
  email: string;
  api_token: string;
};

export type Preferences = {
  default_project: string | null;
  project_list: string[];
};

export const store = new LazyStore("store.json");
