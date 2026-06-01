import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import Task from "./Task";
import { Button } from "@/components/shared/button";
import { Loader2, RefreshCw } from "lucide-react";

export default function TaskList() {
  const {
    data: dateOptions,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["dateOptions"],
    staleTime: Infinity,
    queryFn: () => invoke<string[]>("get_date_options"),
    retry: false,
  });

  return (
    <div className="flex flex-col items-center gap-4">
      {isFetching ? (
        <Loader2 className="animate-spin" />
      ) : error ? (
        <div className="text-red-500 flex flex-col gap-4">{String(error)}</div>
      ) : (
        <ol className="flex flex-col gap-3">
          {dateOptions?.map((option) => (
            <Task key={option} date={new Date(option)} />
          ))}
        </ol>
      )}
      <Button size="icon-lg" onClick={() => refetch()} disabled={isFetching}>
        <RefreshCw />
      </Button>
    </div>
  );
}
