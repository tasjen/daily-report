import "./App.css";
import { useEffect } from "react";
import AccountForm from "./account-form";
import { Toaster } from "./components/shared/sonner";
import DateList from "./date-list";
import { useTaskParameters } from "./lib/queries";
import OpenMemberPageButton from "./open-member-page-button";
import PreferencesForm from "./preferences-form";
import RefreshDateListButton from "./refresh-date-list-button";
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
    return null;
  }

  return (
    <div className="flex">
      <header className="sticky bottom-0 h-screen justify-end p-2 mt-auto z-10 flex flex-col gap-2">
        {taskParametersQuery.isSuccess && <OpenMemberPageButton />}
        <RefreshDateListButton />
        {taskParametersQuery.isSuccess && <PreferencesForm />}
        <AccountForm />
      </header>
      <main className="container py-4 [&_svg]:flex-none">
        {account && <DateList />}
        <Toaster />
      </main>
    </div>
  );
}
