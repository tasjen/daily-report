import "@/App.css";
import AccountForm from "@/components/account-form";
import DateList from "@/components/date-list";
import FavoritesForm from "@/components/favorites-form";
import OpenMemberPageButton from "@/components/open-member-page-button";
import PreferencesForm from "@/components/preferences-form";
import RefreshDateListButton from "@/components/refresh-date-list-button";
import { Toaster } from "@/components/shared/sonner";
import { useAccount, useTaskParameters } from "@/lib/queries";
import { useResetWhenAway } from "@/lib/use-reset-when-away";

export default function App() {
  const accountQuery = useAccount();
  const taskParametersQuery = useTaskParameters();
  useResetWhenAway();

  if (accountQuery.isPending) {
    return null;
  }

  return (
    <div className="flex">
      <header className="sticky bottom-0 z-10 mt-auto flex h-screen flex-col justify-end gap-2 p-2">
        {taskParametersQuery.isSuccess && <OpenMemberPageButton />}
        <RefreshDateListButton />
        <FavoritesForm />
        {taskParametersQuery.isSuccess && <PreferencesForm />}
        <AccountForm />
      </header>
      <main className="flex-1 py-4 pr-4 [&_svg]:flex-none">
        {accountQuery.data && <DateList />}
        <Toaster />
      </main>
    </div>
  );
}
