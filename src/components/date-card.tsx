import { Trans, useLingui } from "@lingui/react/macro";
import {
  CircleAlertIcon,
  CopyCheckIcon,
  CopyIcon,
  Loader2Icon,
  PlayIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/shared/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shared/card";
import { Separator } from "@/components/shared/separator";
import TaskSelect from "@/components/task-select";
import {
  buildSubmission,
  getDateRelation,
  jqlFor,
  toOptionItems,
} from "@/lib/date-card-helpers";
import { useSubmitTaskMutation } from "@/lib/mutations";
import { usePreferences } from "@/lib/queries";
import { DEFAULT_PREFERENCES } from "@/lib/store";
import { useDateCardTasks } from "@/lib/use-date-card-tasks";
import { useTaskSelection } from "@/lib/use-task-selection";
import { cn, toastError } from "@/lib/utils";

type Props = {
  date: string;
};
export default function DateCard({ date }: Props) {
  const { i18n, t } = useLingui();
  const { data: preferences } = usePreferences();
  const defaultGroupIds = new Set(
    preferences?.default_task_groups ?? DEFAULT_PREFERENCES.default_task_groups,
  );

  const {
    jqlByGroup,
    issueGroups,
    allIssues,
    createdKeys,
    favorites,
    error,
    isFetching,
    refetchAll,
  } = useDateCardTasks(date, defaultGroupIds);

  // One option list per source query, rendered as its own TaskSelect. `keys`
  // is kept alongside so the per-group selection handler can scope its toggles.
  const optionGroups = issueGroups.map((group) => ({
    type: group.id,
    label: i18n._(group.label),
    description: i18n._(group.description),
    jql: jqlFor(jqlByGroup, group.id),
    keys: group.issues.map((issue) => issue.key),
    items: toOptionItems(group),
  }));

  const {
    selectedKeys,
    selectedKeySet,
    handleSelectionChange,
    reset: resetSelection,
  } = useTaskSelection(issueGroups, defaultGroupIds);

  const projectMap =
    preferences?.project_map ?? DEFAULT_PREFERENCES.project_map;
  const defaultProject =
    preferences?.default_project ?? DEFAULT_PREFERENCES.default_project;

  // `summaryText` is the unsplit preview/copy text; `submitEntries` is the
  // same selection split into up to 3 form rows. The splitting/bucketing
  // semantics live in buildSubmission (date-card-helpers.ts).
  const { summaryText, submitEntries } = buildSubmission({
    selectedKeys,
    allIssues,
    createdKeys,
    projectMap,
    defaultProject,
    favorites,
  });

  const autofillSummary =
    preferences?.autofill_summary ?? DEFAULT_PREFERENCES.autofill_summary;

  const dateRelation = getDateRelation(
    date,
    i18n.locale,
    t`Today`,
    t`Yesterday`,
    (dayCount) => t`${dayCount} days ago`,
  );

  const [isCopied, setIsCopied] = useState(false);
  const { mutate: submitTask, isPending: isSubmitting } =
    useSubmitTaskMutation();
  return (
    // DateList renders one card per date, so the card's own testid is what
    // scopes the inner ones (`submit-task`, `task-group-*`) to a single date.
    <Card as="li" data-testid={`date-card-${date}`}>
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
          onClick={() => {
            refetchAll();
            // Refetched issues should come back on their group defaults, not
            // carrying overrides recorded against the previous result set.
            resetSelection();
          }}
          disabled={isFetching}
        >
          <RefreshCwIcon />
        </Button>
        <Button
          variant="secondary"
          data-testid="submit-task"
          onClick={() =>
            submitTask({
              date,
              // Without autofill there is no text to split by project, so
              // send one empty row and let the backend fall back to the
              // default project — the pre-mapping behavior.
              entries: autofillSummary
                ? submitEntries
                : [{ project: null, summary: "" }],
            })
          }
          disabled={isSubmitting || (autofillSummary && isFetching)}
        >
          {isSubmitting ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <PlayIcon />
          )}
        </Button>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-4">
        <div
          className={cn("flex flex-col gap-2 min-[832px]:flex-row", {
            "min-[832px]:grid min-[832px]:grid-cols-2":
              optionGroups.filter((group) => group.items.length > 0).length > 3,
          })}
        >
          {optionGroups.map((group) => (
            <TaskSelect
              key={group.type}
              className="min-w-0 flex-1"
              testId={`task-group-${group.type}`}
              label={group.label}
              description={group.description}
              jql={group.jql}
              items={group.items}
              plainLabels={group.type === "favorite"}
              value={group.keys.filter((key) => selectedKeySet.has(key))}
              onValueChange={(selected) =>
                handleSelectionChange(group.keys, selected)
              }
            />
          ))}
        </div>
        {isFetching ? (
          <Loader2Icon className="animate-spin" />
        ) : error ? (
          <p
            role="alert"
            className="flex items-start gap-2 whitespace-pre-wrap text-red-500"
          >
            <CircleAlertIcon className="mt-1 size-4" />
            {error instanceof Error ? error.message : String(error)}
          </p>
        ) : (
          <p
            className={cn(
              "relative mt-4 whitespace-pre-wrap",
              !summaryText && "text-muted-foreground italic",
            )}
          >
            {!summaryText ? (
              // no tasks at all vs. tasks exist but none selected (reachable
              // when `default_task_groups` is empty or all were unchecked)
              allIssues.length ? (
                <Trans>No tasks selected</Trans>
              ) : (
                <Trans>No tasks found</Trans>
              )
            ) : (
              <>
                {summaryText}
                <Button
                  variant="ghost"
                  className={cn("absolute -top-2 right-0", {
                    "not-hover:text-muted-foreground": !isCopied,
                  })}
                  onClick={() => {
                    if (isCopied) return;
                    navigator.clipboard
                      .writeText(summaryText)
                      .then(() => {
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2000);
                      })
                      .catch(toastError);
                  }}
                >
                  {isCopied ? <CopyCheckIcon /> : <CopyIcon />}
                </Button>
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
