import { Store } from "@tauri-apps/plugin-store";

const storeName = "store.json";

export async function getStore() {
  const store = await Store.get(storeName);
  if (!store) {
    return Store.load(storeName);
  }
  return store;
}
