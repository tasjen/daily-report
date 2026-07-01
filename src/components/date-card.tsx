import {
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
import { useJiraTasksQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { JiraIssue } from "@/type";

type Props = {
  date: string;
};
export default function DateCard({ date }: Props) {
  const dateAfter = getDateAfter(date);
  const jqlStatusUpdatedByMe = `status CHANGED BY currentUser() DURING ("${date}", "${dateAfter}")`;
  const jqlCreatedByMe = `creator = currentUser() AND created >= "${date}" AND created < "${dateAfter}"`;
  const jqlMyActiveSprintNotDone = `assignee = currentUser() AND created <= "${date}" AND sprint in openSprints() AND statusCategory != Done`;

  // Each set is queried separately so it can carry its own default: only the
  // status-updated issues are checked by default; created and active-sprint
  // issues are offered as options but start unchecked.
  const queryOptions = {
    refetchOnMount: "always",
  } as const;
  const statusQuery = useJiraTasksQuery(jqlStatusUpdatedByMe, queryOptions);
  const createdQuery = useJiraTasksQuery(jqlCreatedByMe, queryOptions);
  const sprintQuery = useJiraTasksQuery(jqlMyActiveSprintNotDone, queryOptions);

  const error = statusQuery.error ?? createdQuery.error ?? sprintQuery.error;
  const isFetching =
    statusQuery.isFetching || createdQuery.isFetching || sprintQuery.isFetching;

  // Group issues by the query that surfaced them, de-duplicated by key across
  // groups: an issue appearing in more than one query stays in the
  // highest-priority group (status-updated, then active-sprint, then created).
  // Empty groups are dropped.
  const issueGroups = useMemo(() => {
    const seen = new Set<string>();
    const sources: { label: string; issues: JiraIssue[] }[] = [
      { label: "Status updated by me", issues: statusQuery.data?.issues ?? [] },
      { label: "Created today by me", issues: createdQuery.data?.issues ?? [] },
      {
        label: "Assigned to me not done",
        issues: sprintQuery.data?.issues ?? [],
      },
    ];
    return sources
      .map(({ label, issues }) => ({
        label,
        issues: issues.filter((issue) => {
          if (seen.has(issue.key)) return false;
          seen.add(issue.key);
          return true;
        }),
      }))
      .filter((group) => group.issues.length > 0);
  }, [statusQuery.data, createdQuery.data, sprintQuery.data]);

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

  // Status-updated issues start checked; everything else starts unchecked.
  // `overrides` records the user's explicit toggles on top of that default, so
  // new issues from a later refetch still pick up the correct default.
  const defaultCheckedKeys = useMemo(
    () => new Set(statusQuery.data?.issues.map((issue) => issue.key)),
    [statusQuery.data],
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

  // Each TaskSelect reports only its own group's selection, so merge those keys
  // into `overrides` without disturbing the other groups' toggles.
  function handleSelectionChange(groupKeys: string[], selected: string[]) {
    const next = new Set(selected);
    setOverrides((prev) => ({
      ...prev,
      ...Object.fromEntries(groupKeys.map((key) => [key, next.has(key)])),
    }));
  }

  const summaryText = useMemo(() => {
    const selected = new Set(selectedKeys);
    return buildSummary(allIssues.filter((issue) => selected.has(issue.key)));
  }, [allIssues, selectedKeys]);

  const [isCopied, setIsCopied] = useState(false);
  const { mutate: submitTask } = useSubmitTaskMutation();
  return (
    <Card>
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
          onClick={() => submitTask({ date, summary: summaryText })}
        >
          <PlayIcon />
        </Button>
      </CardHeader>
      <Separator />
      <CardContent className="relative space-y-4">
        <div className="flex gap-2">
          {optionGroups.map((group) => (
            <TaskSelect
              key={group.label}
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
          `Error: ${error}`
        ) : (
          <>
            <p
              className={cn(
                "mt-2 whitespace-pre-wrap",
                !summaryText && "text-muted-foreground italic",
              )}
            >
              {summaryText || "ไม่พบ Jira issue"}
            </p>
            {summaryText && (
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
            )}
          </>
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
  d.setDate(d.getDate() + 1);
  const result = d.toISOString().split("T")[0];
  if (!result) throw new Error("Invalid date");
  return result;
}
