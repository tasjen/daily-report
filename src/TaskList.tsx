import Task from "./Task";
import { Button } from "@/components/shared/button";
import { Loader2, RefreshCw } from "lucide-react";
import { useTaskOptions } from "./useTaskOptions";

export default function TaskList() {
  const { data, isFetching, error, refetch } = useTaskOptions();

  return (
    <div className="flex flex-col items-center gap-4">
      {isFetching ? (
        <Loader2 className="animate-spin" />
      ) : error ? (
        <div className="text-red-500 flex flex-col gap-4">{String(error)}</div>
      ) : (
        <ol className="flex flex-col w-full gap-3">
          {data?.dates.slice(0, 20).map((option) => (
            <Task key={option} date={option} />
          ))}
        </ol>
      )}
      <Button size="icon-lg" onClick={() => refetch()} disabled={isFetching}>
        <RefreshCw />
      </Button>
    </div>
  );
}
