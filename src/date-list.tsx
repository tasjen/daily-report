import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/shared/button";
import DateCard from "./date-card";
import { useTaskParameters } from "./lib/queries";

export default function DateList() {
  const { data, isFetching, error, refetch } = useTaskParameters();
  const [animateRef] = useAutoAnimate({ disrespectUserMotionPreference: true });

  return (
    <div className="flex flex-col items-center gap-4">
      {isFetching ? (
        <Loader2Icon className="animate-spin" />
      ) : error ? (
        <p className="text-red-500 flex flex-col gap-4 whitespace-pre-wrap text-center">
          {String(error)}
        </p>
      ) : (
        <ol ref={animateRef} className="flex flex-col w-full gap-3">
          {data?.dates
            .slice(0, 5)
            .filter((e) => e.value)
            .map((option) => (
              <DateCard key={option.value} date={option.value} />
            ))}
        </ol>
      )}
      {!isFetching && (
        <Button size="icon-lg" variant="secondary" onClick={() => refetch()}>
          <RefreshCwIcon />
        </Button>
      )}
    </div>
  );
}
