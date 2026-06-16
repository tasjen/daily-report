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
import type { JiraIssue, SelectOption } from "@/type";

type Props = {
  date: string;
};
export default function DateCard({ date }: Props) {
  const dateAfter = getDateAfter(date);
  const jqlStatusUpdatedByMe = `status CHANGED BY currentUser() DURING ("${date}", "${dateAfter}")`;
  const jqlMyActiveSprintNotDone = `assignee = currentUser() AND created <= "${date}" AND sprint in openSprints() AND statusCategory != Done`;
  const jqlCreatedByMe = `creator = currentUser() AND created >= "${date}" AND created < "${dateAfter}"`;

  // Each set is queried separately so it can carry its own default: only the
  // status-updated issues are checked by default; created and active-sprint
  // issues are offered as options but start unchecked.
  const statusQuery = useJiraTasksQuery(jqlStatusUpdatedByMe, {
    refetchOnMount: "always",
  });
  const sprintQuery = useJiraTasksQuery(jqlMyActiveSprintNotDone, {
    refetchOnMount: "always",
  });
  const createdQuery = useJiraTasksQuery(jqlCreatedByMe, {
    refetchOnMount: "always",
  });

  const error = statusQuery.error ?? createdQuery.error ?? sprintQuery.error;
  const isFetching =
    statusQuery.isFetching || sprintQuery.isFetching || createdQuery.isFetching;

  // Union of all three result sets, de-duplicated by issue key. Sources are
  // merged in priority order (status-updated, then created, then active-sprint)
  // so an issue appearing in more than one keeps its highest-priority grouping.
  const allIssues = useMemo(() => {
    const byKey = new Map<string, JiraIssue>();
    for (const issue of [
      ...(statusQuery.data?.issues ?? []),
      ...(sprintQuery.data?.issues ?? []),
      ...(createdQuery.data?.issues ?? []),
    ]) {
      if (!byKey.has(issue.key)) byKey.set(issue.key, issue);
    }
    return [...byKey.values()];
  }, [statusQuery.data, createdQuery.data, sprintQuery.data]);

  const issueOptions = useMemo<SelectOption[]>(
    () =>
      allIssues
        .map((issue) => ({
          value: issue.key,
          label: `${issue.key}: ${issue.fields.summary}`,
        }))
        .sort((a, b) => a.value.localeCompare(b.value)),
    [allIssues],
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

  function handleSelectionChange(keys: string[]) {
    const next = new Set(keys);
    setOverrides(
      Object.fromEntries(
        allIssues.map((issue) => [issue.key, next.has(issue.key)]),
      ),
    );
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
      <CardContent className="relative">
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
            <TaskSelect
              items={issueOptions}
              value={selectedKeys}
              onValueChange={handleSelectionChange}
            />
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
          .map((issue) => `· ${issue.key}: ${issue.fields.summary}`)
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
