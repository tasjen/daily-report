import "./App.css";
import { Loader2Icon } from "lucide-react";
import { useEffect } from "react";
import AccountForm from "./account-form";
import { Toaster } from "./components/shared/sonner";
import DateList from "./date-list";
import { useTaskParameters } from "./lib/queries";
import PreferencesForm from "./preferences-form";
import { type GlobalState, useGlobalState } from "./store";
import ThemeToggle from "./theme-toggle";

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
    return <Loader2Icon className="animate-spin" />;
  }

  return (
    <>
      {account && <DateList />}
      <div className="fixed bottom-2 flex gap-2 w-full container">
        <ThemeToggle />
        {taskParametersQuery.isSuccess && <PreferencesForm />}
        <AccountForm />
      </div>
      <Toaster />
    </>
  );
}
