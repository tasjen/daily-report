import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Loader2Icon } from "lucide-react";
import DateCard from "@/components/date-card";
import { useTaskParameters } from "@/lib/queries";

export default function DateList() {
  const { data, isFetching, error } = useTaskParameters();
  const [animateRef] = useAutoAnimate({ disrespectUserMotionPreference: true });

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
      ) : (
        <ol ref={animateRef} className="flex w-full max-w-5xl flex-col gap-4">
          {data?.dates
            .filter((e) => e.value)
            .slice(0, 5)
            .map((option) => (
              <DateCard key={option.value} date={option.value} />
            ))}
        </ol>
      )}
    </div>
  );
}
