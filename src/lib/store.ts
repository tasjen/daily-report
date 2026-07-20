import { LazyStore } from "@tauri-apps/plugin-store";

// Schema of store.json. The Rust backend reads the same keys
// (src-tauri/src/lib.rs), so field names must stay in sync.
export type Account = {
  phone: string;
  email: string;
  api_token: string;
  // Portal base URL, stored without a trailing slash — the backend joins
  // paths as `format!("{base_url}/task.php")`.
  portal_url: string;
  // HTTP Basic-auth credential in "user:pass" form, encoded verbatim into
  // the Authorization header by the backend.
  portal_credential: string;
};

// A free-form favorite task. Frontend-only: the Rust side never reads this
// key. The text itself is the identity — the favorites dialog rejects
// duplicates, so no generated ids. `project_key` optionally tags the favorite
// with a project key (a real Jira one or any custom label) so the date card
// buckets it through `project_map` like a real issue; null keeps it in the
// first form row. Favorites saved before the field existed are plain strings
// — `favoritesOptions` normalizes them to this shape at read time.
export type Favorite = { text: string; project_key: string | null };

export type TaskGroupType = "status" | "created" | "sprint" | "favorite";

export type Preferences = {
  default_project: string | null;
  project_list: string[];
  // Project key → portal project option id. A project key is a Jira
  // issue-key prefix (e.g. "ABC") or a favorite's custom `project_key` tag.
  // Selected tasks are bucketed by mapped portal project and each bucket
  // fills its own project-select/textarea row pair in the task form, largest
  // bucket first. The form has 3 row pairs, so the editor caps this at 3
  // distinct values.
  project_map: Record<string, string>;
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
  project_map: {},
  default_task_groups: ["status"],
  autofill_summary: true,
  auto_submit: false,
  auto_close: false,
};

export const store = new LazyStore("store.json");
