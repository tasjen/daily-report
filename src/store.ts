import { LazyStore } from "@tauri-apps/plugin-store";
import { create } from "zustand";

// Define types for state & actions
export type GlobalState = {
  store: LazyStore;
  settings:
    | {
        phone: string;
        email: string;
        api_token: string;
        default_project: string;
      }
    | null
    | undefined;
};

export type GlobalAction = {
  setSettings: (s: Exclude<GlobalState["settings"], undefined>) => void;
};

// Create store using the curried form of `create`
export const useGlobalState = create<GlobalState & GlobalAction>()((set) => ({
  store: new LazyStore("store.json"),
  settings: undefined,
  setSettings: (s) => set((prev) => ({ ...prev, settings: s })),
}));
