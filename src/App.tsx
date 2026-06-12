import "@/App.css";
import AccountForm from "@/components/account-form";
import DateList from "@/components/date-list";
import OpenMemberPageButton from "@/components/open-member-page-button";
import PreferencesForm from "@/components/preferences-form";
import RefreshDateListButton from "@/components/refresh-date-list-button";
import { Toaster } from "@/components/shared/sonner";
import { useAccount, useTaskParameters } from "@/lib/queries";

export default function App() {
  const accountQuery = useAccount();
  const taskParametersQuery = useTaskParameters();

  if (accountQuery.isPending) {
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
        {accountQuery.data && <DateList />}
        <Toaster />
      </main>
    </div>
  );
}
