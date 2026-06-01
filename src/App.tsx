import "./App.css";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import DateList from "./DateList";
import SettingsForm from "./SettingsForm";
import { type GlobalState, useGlobalState } from "./store";

export default function App() {
  const store = useGlobalState((state) => state.store);
  const settings = useGlobalState((state) => state.settings);
  const setSettings = useGlobalState((state) => state.setSettings);

  useEffect(() => {
    (async () => {
      const settings = await store.get<GlobalState["settings"]>("settings");
      setSettings(settings ?? null);
    })();
  }, []);

  if (settings === undefined) {
    return <Loader2 className="animate-spin" />;
  }

  return (
    <>
      <SettingsForm />
      {settings && <DateList />}
    </>
  );
}
