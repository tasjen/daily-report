import {
  CircleAlertIcon,
  CopyCheckIcon,
  CopyIcon,
  Loader2Icon,
  PlayIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/shared/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/shared/card";
import { Separator } from "@/components/shared/separator";
import TaskSelect from "@/components/task-select";
import { useSubmitTaskMutation } from "@/lib/mutations";
import { useJiraTasksQuery, usePreferences } from "@/lib/queries";
import { DEFAULT_PREFERENCES, type TaskGroupType } from "@/lib/store";
import { TASK_GROUPS } from "@/lib/task-groups";
import { cn } from "@/lib/utils";
import type { JiraIssue } from "@/type";

type Props = {
  date: string;
};
export default function DateCard({ date }: Props) {
  const dateAfter = getDateAfter(date);
  const jqlStatusUpdatedByMe = `status CHANGED BY currentUser() DURING ("${date}", "${dateAfter}")`;
  const jqlCreatedByMe = `creator = currentUser() AND created >= "${date}" AND created < "${dateAfter}"`;
  const jqlMyActiveSprintNotDone = `assignee = currentUser() AND created < "${dateAfter}" AND sprint in openSprints() AND statusCategory != Done`;

  // Each set is queried separately so its issues can be grouped by source and
  // defaulted per the user's `default_task_groups` preference.
  const queryOptions = {
    refetchOnMount: "always",
  } as const;
  const statusQuery = useJiraTasksQuery(jqlStatusUpdatedByMe, queryOptions);
  const createdQuery = useJiraTasksQuery(jqlCreatedByMe, queryOptions);
  const sprintQuery = useJiraTasksQuery(jqlMyActiveSprintNotDone, queryOptions);

  const error = statusQuery.error ?? createdQuery.error ?? sprintQuery.error;
  const isFetching =
    statusQuery.isFetching || createdQuery.isFetching || sprintQuery.isFetching;

  const { data: preferences } = usePreferences();
  const defaultGroupIds = useMemo(
    () =>
      new Set(
        preferences?.default_task_groups ??
          DEFAULT_PREFERENCES.default_task_groups,
      ),
    [preferences],
  );

  // Group issues by the query that surfaced them. Default groups come first
  // (base TASK_GROUPS order within each partition), and dedup by key runs in
  // that same display order — so an issue appearing in more than one query
  // stays in the first group shown on screen. Empty groups are dropped.
  const issueGroups = useMemo(() => {
    const seen = new Set<string>();
    const issuesById: Record<TaskGroupType, JiraIssue[]> = {
      status: statusQuery.data?.issues ?? [],
      created: createdQuery.data?.issues ?? [],
      sprint: sprintQuery.data?.issues ?? [],
    };
    const ordered = [
      ...TASK_GROUPS.filter((group) => defaultGroupIds.has(group.type)),
      ...TASK_GROUPS.filter((group) => !defaultGroupIds.has(group.type)),
    ];
    return ordered
      .map(({ type: id, label }) => ({
        id,
        label,
        issues: issuesById[id].filter((issue) => {
          if (seen.has(issue.key)) return false;
          seen.add(issue.key);
          return true;
        }),
      }))
      .filter((group) => group.issues.length > 0);
  }, [statusQuery.data, createdQuery.data, sprintQuery.data, defaultGroupIds]);

  // Flat union of every grouped issue, used for selection/summary bookkeeping.
  const allIssues = useMemo(
    () => issueGroups.flatMap((group) => group.issues),
    [issueGroups],
  );

  // One option list per source query, rendered as its own TaskSelect. `keys`
  // is kept alongside so the per-group selection handler can scope its toggles.
  const optionGroups = useMemo(
    () =>
      issueGroups.map((group) => ({
        type: group.id,
        label: group.label,
        keys: group.issues.map((issue) => issue.key),
        items: group.issues
          .map((issue) => ({
            value: issue.key,
            label: `${issue.key}: ${issue.fields.summary}`,
          }))
          .sort((a, b) => a.value.localeCompare(b.value)),
      })),
    [issueGroups],
  );

  // Issues displayed under a default task group start checked; everything
  // else starts unchecked. Membership is post-dedup on purpose: what starts
  // checked always matches the groups the user sees on screen. `overrides`
  // records the user's explicit toggles on top of that default, so new issues
  // from a later refetch still pick up the correct default.
  const defaultCheckedKeys = useMemo(
    () =>
      new Set(
        issueGroups
          .filter((group) => defaultGroupIds.has(group.id))
          .flatMap((group) => group.issues.map((issue) => issue.key)),
      ),
    [issueGroups, defaultGroupIds],
  );
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const selectedKeys = useMemo(
    () =>
      allIssues
        .map((issue) => issue.key)
        .filter((key) => overrides[key] ?? defaultCheckedKeys.has(key)),
    [allIssues, overrides, defaultCheckedKeys],
  );
  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

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

  const summaryText = useMemo(() => {
    const selected = new Set(selectedKeys);
    return buildSummary(allIssues.filter((issue) => selected.has(issue.key)));
  }, [allIssues, selectedKeys]);

  const autofillSummary =
    preferences?.autofill_summary ?? DEFAULT_PREFERENCES.autofill_summary;

  const [isCopied, setIsCopied] = useState(false);
  const { mutate: submitTask, isPending: isSubmitting } =
    useSubmitTaskMutation();
  return (
    <Card as="li">
      <CardHeader className="flex flex-none items-center gap-2">
        <CardTitle className="flex-1">{date}</CardTitle>
        <Button
          size="icon-lg"
          variant="ghost"
          onClick={() => {
            statusQuery.refetch();
            createdQuery.refetch();
            sprintQuery.refetch();
            setOverrides({});
          }}
          disabled={isFetching}
        >
          <RefreshCwIcon />
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            submitTask({ date, summary: autofillSummary ? summaryText : "" })
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
        <div className="flex gap-2">
          {optionGroups.map((group) => (
            <TaskSelect
              key={group.type}
              className="min-w-0 flex-1"
              label={group.label}
              items={group.items}
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
          <p className="flex items-start gap-2 whitespace-pre-wrap text-red-500">
            <CircleAlertIcon className="mt-1 size-4" />
            {error instanceof Error ? error.message : String(error)}
          </p>
        ) : (
          <p
            className={cn(
              "relative mt-2 whitespace-pre-wrap",
              !summaryText && "text-muted-foreground italic",
            )}
          >
            {!summaryText ? (
              // no issues at all vs. issues exist but none selected (reachable
              // when `default_task_groups` is empty or all were unchecked)
              allIssues.length ? (
                "No Jira issues selected"
              ) : (
                "No Jira issues found"
              )
            ) : (
              <>
                {summaryText}
                <Button
                  variant="ghost"
                  className={cn("absolute -top-2 right-2", {
                    "not-hover:text-muted-foreground": !isCopied,
                  })}
                  onClick={async () => {
                    if (isCopied) return;
                    await navigator.clipboard.writeText(summaryText);
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2000);
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

function buildSummary(issues: JiraIssue[]): string {
  if (!issues.length) return "";
  const byStatus = issues.reduce<Record<string, JiraIssue[]>>((acc, issue) => {
    acc[issue.fields.status.name] = [
      ...(acc[issue.fields.status.name] ?? []),
      issue,
    ];
    return acc;
  }, {});
  return Object.entries(byStatus)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([status, statusIssues]) =>
        `[${status}]\n${statusIssues
          .sort((a, b) => a.key.localeCompare(b.key))
          .map((issue) => `• ${issue.key}: ${issue.fields.summary}`)
          .join("\n")}`,
    )
    .join("\n\n");
}

function getDateAfter(date: string): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  const result = d.toISOString().split("T")[0];
  if (!result) throw new Error("Invalid date");
  return result;
}
