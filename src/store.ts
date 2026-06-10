import { LazyStore } from "@tauri-apps/plugin-store";
import { create } from "zustand";

// Define types for state & actions
export type GlobalState = {
  store: LazyStore;
  account:
    | {
        phone: string;
        email: string;
        api_token: string;
      }
    | null
    | undefined;
  preferences:
    | {
        default_project: string | null;
        project_list: string[];
      }
    | undefined;
};

export type GlobalAction = {
  setPreferences: (p: Exclude<GlobalState["preferences"], undefined>) => void;
  setAccount: (s: Exclude<GlobalState["account"], undefined>) => void;
};

// Create store using the curried form of `create`
export const useGlobalState = create<GlobalState & GlobalAction>()((set) => ({
  store: new LazyStore("store.json"),
  account: undefined,
  preferences: undefined,
  setAccount: (s) => set((prev) => ({ ...prev, account: s })),
  setPreferences: (p) => set((prev) => ({ ...prev, preferences: p })),
}));
