import "./App.css";
import { createContext, use, useEffect, useState } from "react";
import { Store } from "@tauri-apps/plugin-store";
import SettingsForm from "./SettingsForm";
import TaskList from "./TaskList";
import { Loader2 } from "lucide-react";
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
    return () => {
      store?.close();
    };
  }, []);

  if (!store) {
    return <Loader2 className="animate-spin" />;
  }

  return (
    <StoreContext value={store}>
      <main className="container mx-auto p-4">
        <SettingsForm configured={configured} setConfigured={setConfigured} />
        {configured && <TaskList />}
      </main>
    </StoreContext>
  );
}

export default App;
