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
  buildIssueGroups,
  buildJqlForDate,
  buildSubmission,
  defaultCheckedKeysOf,
  favoritesAsIssues,
  getDateRelation,
  jqlFor,
  toOptionItems,
} from "@/lib/date-card-helpers";
import { useSubmitTaskMutation } from "@/lib/mutations";
import { useFavorites, useJiraTasksQuery, usePreferences } from "@/lib/queries";
import { DEFAULT_PREFERENCES } from "@/lib/store";
import { cn, toastError } from "@/lib/utils";

type Props = {
  date: string;
};
export default function DateCard({ date }: Props) {
  const { i18n, t } = useLingui();
  // The same strings feed the queries below and each group's TaskSelect
  // tooltip, so displayed and executed JQL cannot drift.
  const jqlByGroup = buildJqlForDate(date);

  // Each set is queried separately so its issues can be grouped by source and
  // defaulted per the user's `default_task_groups` preference.
  const queryOptions = {
    refetchOnMount: "always",
  } as const;
  const statusQuery = useJiraTasksQuery(jqlByGroup.status, queryOptions);
  const createdQuery = useJiraTasksQuery(jqlByGroup.created, queryOptions);
  const sprintQuery = useJiraTasksQuery(jqlByGroup.sprint, queryOptions);

  const error = statusQuery.error ?? createdQuery.error ?? sprintQuery.error;
  const isFetching =
    statusQuery.isFetching || createdQuery.isFetching || sprintQuery.isFetching;

  const { data: favorites } = useFavorites();
  const favoriteIssues = favoritesAsIssues(favorites ?? []);

  const { data: preferences } = usePreferences();
  const defaultGroupIds = new Set(
    preferences?.default_task_groups ?? DEFAULT_PREFERENCES.default_task_groups,
  );

  // Group issues by the query that surfaced them; ordering/dedup semantics
  // live in buildIssueGroups (date-card-helpers.ts).
  const issueGroups = buildIssueGroups(
    {
      status: statusQuery.data?.issues ?? [],
      created: createdQuery.data?.issues ?? [],
      sprint: sprintQuery.data?.issues ?? [],
      favorite: favoriteIssues,
    },
    defaultGroupIds,
  );

  // Flat union of every grouped issue, used for selection/summary bookkeeping.
  const allIssues = issueGroups.flatMap((group) => group.issues);

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

  // Issues displayed under a default task group start checked; everything
  // else starts unchecked. `overrides` records the user's explicit toggles on
  // top of that default, so new issues from a later refetch still pick up the
  // correct default.
  const defaultCheckedKeys = defaultCheckedKeysOf(issueGroups, defaultGroupIds);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const selectedKeys = allIssues
    .map((issue) => issue.key)
    .filter((key) => overrides[key] ?? defaultCheckedKeys.has(key));
  const selectedKeySet = new Set(selectedKeys);

  // Each TaskSelect reports its group's entire new selection, not which issue
  // was clicked — so diff it against the current effective selection and
  // record overrides only for issues whose state actually changed. Issues the
  // user never touched keep following `defaultCheckedKeys` when the default
  // task groups preference changes.
  function handleSelectionChange(groupKeys: string[], selected: string[]) {
    const next = new Set(selected);
    setOverrides((prev) => ({
      ...prev,
      ...Object.fromEntries(
        groupKeys
          .filter((key) => next.has(key) !== selectedKeySet.has(key))
          .map((key) => [key, next.has(key)]),
      ),
    }));
  }

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
    createdKeys: new Set(
      issueGroups
        .find((group) => group.id === "created")
        ?.issues.map((issue) => issue.key) ?? [],
    ),
    projectMap,
    defaultProject,
    favorites: favorites ?? [],
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
            void statusQuery.refetch();
            void createdQuery.refetch();
            void sprintQuery.refetch();
            setOverrides({});
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
