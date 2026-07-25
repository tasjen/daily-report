import { useLingui } from "@lingui/react/macro";
import { Loader2Icon, PlayIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/shared/button";
import { CardHeader, CardTitle } from "@/components/shared/card";
import { getDateRelation } from "@/lib/date-card-helpers";

type Props = {
  date: string;
  isFetching: boolean;
  // Drives the button's spinner. Distinct from `submitDisabled`, which is also
  // set while the summary being submitted is still being fetched.
  isSubmitting: boolean;
  submitDisabled: boolean;
  onRefresh: () => void;
  onSubmit: () => void;
};

export default function DateCardHeader({
  date,
  isFetching,
  isSubmitting,
  submitDisabled,
  onRefresh,
  onSubmit,
}: Props) {
  const { i18n, t } = useLingui();
  const dateRelation = getDateRelation(
    date,
    i18n.locale,
    t`Today`,
    t`Yesterday`,
    (dayCount) => t`${dayCount} days ago`,
  );

  return (
    <CardHeader className="flex flex-none items-center gap-2">
      <CardTitle className="flex-1">
        {date}
        {dateRelation && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({dateRelation})
          </span>
        )}
      </CardTitle>
      <Button
        size="icon-lg"
        variant="ghost"
        onClick={onRefresh}
        disabled={isFetching}
      >
        <RefreshCwIcon />
      </Button>
      <Button
        variant="secondary"
        data-testid="submit-task"
        onClick={onSubmit}
        disabled={submitDisabled}
      >
        {isSubmitting ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
      </Button>
    </CardHeader>
  );
}
