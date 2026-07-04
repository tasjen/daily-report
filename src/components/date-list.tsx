import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import DateCard from "@/components/date-card";
import { Button } from "@/components/shared/button";
import { useTaskParameters } from "@/lib/queries";

const PAGE_SIZE = 5;

export default function DateList() {
  const { data, isFetching, error } = useTaskParameters();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [animateRef, setEnabled] = useAutoAnimate({
    disrespectUserMotionPreference: true,
  });

  const dates = data?.dates.filter((e) => e.value) ?? [];

  const isMocking = true;
  if (import.meta.env.DEV && isMocking && !dates.length) {
    dates.push(
      { value: "2026-06-15", label: "2023-06-15" },
      { value: "2026-06-16", label: "2023-06-16" },
      { value: "2026-06-17", label: "2023-06-17" },
      { value: "2026-06-30", label: "2023-06-30" },
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-muted-foreground">
        © {new Date().getFullYear()} FlexiRent. All rights reserved.
      </p>
      {isFetching ? (
        <Loader2Icon className="animate-spin" />
      ) : error ? (
        <p className="flex flex-col gap-4 whitespace-pre-wrap text-center text-red-500">
          {String(error)}
        </p>
      ) : !dates.length ? (
        <p className="text-muted-foreground italic">No reports to submit</p>
      ) : (
        <>
          <ol ref={animateRef} className="flex w-full max-w-5xl flex-col gap-4">
            {dates.slice(0, visibleCount).map((option) => (
              <DateCard key={option.value} date={option.value} />
            ))}
          </ol>
          {visibleCount < dates.length && (
            <Button
              variant="outline"
              onClick={() => {
                setEnabled(false);
                setVisibleCount((prev) => prev + PAGE_SIZE);
                setTimeout(() => setEnabled(true), 500);
              }}
            >
              Load more
            </Button>
          )}
        </>
      )}
    </div>
  );
}
