import "./App.css";
import { Store } from "@tauri-apps/plugin-store";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import SettingsForm from "./SettingsForm";
import TaskList from "./TaskList";

// const StoreContext = createContext<Store | null>(null);
async function getStore() {
  const store = await Store.get("store.json");
  if (!store) {
    return Store.load("store.json");
  }
  return store;
}

export default function App() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const storeRef = useRef<Store | null>(null);

  useEffect(() => {
    (async () => {
      const store = await getStore();
      storeRef.current = store;
      const phone = await store.get("phone");
      setConfigured(!!phone);
    })();

    return () => {
      storeRef.current?.close();
    };
  }, []);

  if (configured === null) {
    return <Loader2 className="animate-spin" />;
  }

  return (
    <>
      <SettingsForm configured={configured} setConfigured={setConfigured} />
      {configured && <TaskList />}
    </>
  );
}
