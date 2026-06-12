import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/shared/button";
import { useTaskParameters } from "@/lib/queries";

export default function RefreshDateListButton() {
  const { isFetching, refetch } = useTaskParameters();
  return (
    <Button
      size="icon-xl"
      variant="ghost"
      disabled={isFetching}
      onClick={() => refetch()}
    >
      <RefreshCwIcon className="size-6" />
    </Button>
  );
}
