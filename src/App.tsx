import "./App.css";
import { createContext, use, useEffect, useState } from "react";
import { Store } from "@tauri-apps/plugin-store";
import SettingsForm from "./SettingsForm";
import TaskList from "./TaskList";

const StoreContext = createContext<Store | null>(null);

export const useStore = () => {
  const store = use(StoreContext);
  if (!store) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return store;
};

function App() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [store, setStore] = useState<Store | null>(null);

  useEffect(() => {
    Store.load("store.json").then(async (store) => {
      setStore(store);
      const phone = await store.get("phone");
      setConfigured(!!phone);
    });
  }, []);

  if (!store) {
    return "Loading";
  }

  return (
    <StoreContext value={store}>
      <main className="container mx-auto">
        <SettingsForm
          defaultOpen={configured === false}
          onSave={() => setConfigured(true)}
        />
        {configured && <TaskList />}
      </main>
    </StoreContext>
  );
}

export default App;
