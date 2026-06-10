import "./App.css";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import AccountForm from "./AccountForm";
import { Toaster } from "./components/shared/sonner";
import DateList from "./DateList";
import { useTaskParameters } from "./lib/queries";
import PreferencesForm from "./PreferencesForm";
import { type GlobalState, useGlobalState } from "./store";

export default function App() {
  const store = useGlobalState((state) => state.store);
  const account = useGlobalState((state) => state.account);
  const setAccount = useGlobalState((state) => state.setAccount);
  const setPreferences = useGlobalState((state) => state.setPreferences);
  const taskParametersQuery = useTaskParameters();

  useEffect(() => {
    (async () => {
      const storeAccount = await store.get<GlobalState["account"]>("account");
      const preferences =
        await store.get<GlobalState["preferences"]>("preferences");
      setAccount(storeAccount ?? null);
      setPreferences(
        preferences ?? {
          default_project: null,
          project_list: [],
        },
      );
    })();
  }, []);

  if (account === undefined) {
    return <Loader2 className="animate-spin" />;
  }

  return (
    <>
      {account && <DateList />}
      <div className="fixed bottom-2 right-2">
        {taskParametersQuery.isSuccess && <PreferencesForm />}
        <AccountForm />
      </div>
      <Toaster />
    </>
  );
}
