import { Trans, useLingui } from "@lingui/react/macro";
import {
  CircleAlertIcon,
  CopyCheckIcon,
  CopyIcon,
  Loader2Icon,
  PlayIcon,
  RefreshCwIcon,
} from "lucide-react";
import { create } from "mutative";
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
import { type SubmitTaskEntry, useSubmitTaskMutation } from "@/lib/mutations";
import { useFavorites, useJiraTasksQuery, usePreferences } from "@/lib/queries";
import { DEFAULT_PREFERENCES, type TaskGroupType } from "@/lib/store";
import { TASK_GROUPS } from "@/lib/task-groups";
import { cn } from "@/lib/utils";
import type { JiraIssue } from "@/type";

// Prefix that namespaces favorite keys away from real Jira issue keys, so
// dedup/selection state can never collide and the summary builder can split
// favorites back out of the flat selection.
const FAVORITE_KEY_PREFIX = "favorite:";

type Props = {
  date: string;
};
export default function DateCard({ date }: Props) {
  const { i18n, t } = useLingui();
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

  const { data: favorites } = useFavorites();
  // Favorites masquerade as issues so the existing dedup/default-checked/
  // override machinery applies unchanged. buildSummary never sees them —
  // they're split back out into plain leading lines.
  const favoriteIssues = useMemo(
    () =>
      (favorites ?? []).map((favorite) => ({
        id: favorite.text,
        key: `${FAVORITE_KEY_PREFIX}${favorite.text}`,
        fields: {
          summary: favorite.text,
          status: { name: "" },
          updated: "",
          duedate: "",
        },
      })),
    [favorites],
  );

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
      favorite: favoriteIssues,
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
  }, [
    statusQuery.data,
    createdQuery.data,
    sprintQuery.data,
    favoriteIssues,
    defaultGroupIds,
  ]);

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
        label: i18n._(group.label),
        keys: group.issues.map((issue) => issue.key),
        // Favorites show their text alone, in the order they were added;
        // Jira issues show "KEY: summary" sorted by key.
        items:
          group.id === "favorite"
            ? group.issues.map((issue) => ({
                value: issue.key,
                label: issue.fields.summary,
              }))
            : group.issues
                .map((issue) => ({
                  value: issue.key,
                  label: `${issue.key}: ${issue.fields.summary}`,
                }))
                .toSorted((a, b) => a.value.localeCompare(b.value)),
      })),
    [issueGroups, i18n.locale],
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

  const projectMap =
    preferences?.project_map ?? DEFAULT_PREFERENCES.project_map;
  const defaultProject =
    preferences?.default_project ?? DEFAULT_PREFERENCES.default_project;

  // Selected favorites lead the summary as plain "• text" lines outside any
  // status block; the remaining Jira issues are grouped by status as before.
  // Issues displayed under the "created" group are relabeled to a synthetic
  // "Created" status so buildSummary's group-by-status gives them their own
  // [Created] block. Cloned, not mutated — issues live in the react-query cache.
  //
  // `submitEntries` splits the same selection into up to 3 form rows by the
  // project_map preference (project key → portal project id): an issue's
  // project key comes from its Jira key prefix, a favorite's from its
  // optional `project_key` tag. Mapped tasks bucket by portal project — favorites
  // count toward bucket size — largest bucket first; each row's favorites
  // lead its comment as plain bullets. Unmapped tasks bucket under the
  // default project when one is set (joining its mapped bucket, if any);
  // without a default they ride along in row 1's comment. With no bucket at
  // all this degrades to a single row whose project the backend defaults.
  // `summaryText` (the preview/copy text) stays the unsplit combined summary.
  const { summaryText, submitEntries } = useMemo(() => {
    const selected = new Set(selectedKeys);
    const selectedIssues = allIssues.filter((issue) => selected.has(issue.key));
    const createdKeys = new Set(
      issueGroups
        .find((group) => group.id === "created")
        ?.issues.map((issue) => issue.key) ?? [],
    );
    const selectedFavoriteTexts = selectedIssues
      .filter((issue) => issue.key.startsWith(FAVORITE_KEY_PREFIX))
      .map((issue) => issue.fields.summary);
    const jiraIssues = selectedIssues
      .filter((issue) => !issue.key.startsWith(FAVORITE_KEY_PREFIX))
      .map((issue) =>
        createdKeys.has(issue.key)
          ? create(issue, (draft) => {
              draft.fields.status.name = "Created";
            })
          : issue,
      );
    const bulletLines = (texts: string[]) =>
      texts.map((text) => `• ${text}`).join("\n");
    const summaryText = [
      bulletLines(selectedFavoriteTexts),
      buildSummary(jiraIssues),
    ]
      .filter(Boolean)
      .join("\n\n");

    const favoriteKeyByText = new Map(
      (favorites ?? []).map((favorite) => [
        favorite.text,
        favorite.project_key,
      ]),
    );
    type Bucket = { issues: JiraIssue[]; favoriteTexts: string[] };
    const buckets = new Map<string, Bucket>();
    const getBucket = (portalProject: string): Bucket => {
      let bucket = buckets.get(portalProject);
      if (!bucket) {
        bucket = { issues: [], favoriteTexts: [] };
        buckets.set(portalProject, bucket);
      }
      return bucket;
    };
    const unmappedIssues: JiraIssue[] = [];
    const unmappedFavoriteTexts: string[] = [];
    // No mapping for the task's project key → the default project's bucket
    // when one is set, else the unmapped arrays appended to row 1 below.
    const resolvePortalProject = (projectKey: string | null | undefined) =>
      (projectKey ? projectMap[projectKey] : undefined) ?? defaultProject;
    for (const issue of jiraIssues) {
      const portalProject = resolvePortalProject(issue.key.split("-")[0]);
      if (portalProject) getBucket(portalProject).issues.push(issue);
      else unmappedIssues.push(issue);
    }
    for (const text of selectedFavoriteTexts) {
      const portalProject = resolvePortalProject(favoriteKeyByText.get(text));
      if (portalProject) getBucket(portalProject).favoriteTexts.push(text);
      else unmappedFavoriteTexts.push(text);
    }
    // Stable sort by task count (favorites included), so equally-sized
    // buckets keep display order. The map editor caps distinct portal
    // projects at 3, but a distinct default-project bucket (or a hand-edited
    // store) can push past that — merge any overflow into the 3rd row.
    const size = (bucket: Bucket) =>
      bucket.issues.length + bucket.favoriteTexts.length;
    const ranked = [...buckets.entries()].toSorted(
      (a, b) => size(b[1]) - size(a[1]),
    );
    const rows = ranked.slice(0, 3);
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      for (const [, bucket] of ranked.slice(3)) {
        lastRow[1].issues.push(...bucket.issues);
        lastRow[1].favoriteTexts.push(...bucket.favoriteTexts);
      }
    }
    const submitEntries: SubmitTaskEntry[] = rows.length
      ? rows.map(([project, bucket], i) => ({
          project,
          summary: [
            bulletLines(
              i === 0
                ? [...bucket.favoriteTexts, ...unmappedFavoriteTexts]
                : bucket.favoriteTexts,
            ),
            buildSummary(
              i === 0 ? [...bucket.issues, ...unmappedIssues] : bucket.issues,
            ),
          ]
            .filter(Boolean)
            .join("\n\n"),
        }))
      : [{ project: null, summary: summaryText }];
    return { summaryText, submitEntries };
  }, [
    allIssues,
    issueGroups,
    selectedKeys,
    projectMap,
    defaultProject,
    favorites,
  ]);

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
    <Card as="li">
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
              label={group.label}
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
          <p className="flex items-start gap-2 whitespace-pre-wrap text-red-500">
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
    .toSorted((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([status, statusIssues]) =>
        `[${status}]\n${statusIssues
          .toSorted((a, b) => a.key.localeCompare(b.key))
          .map((issue) => `• ${issue.key}: ${issue.fields.summary}`)
          .join("\n")}`,
    )
    .join("\n\n");
}

// "Today"/"Yesterday", the weekday name within the last week, then "N days
// ago". Diffed at UTC midnight so a DST shift can't skew the day count.
function getDateRelation(
  date: string,
  locale: string,
  today: string,
  yesterday: string,
  daysAgo: (dayCount: number) => string,
): string | null {
  const [year, month, day] = date.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }
  const dateUtc = Date.UTC(year, month - 1, day);
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((todayUtc - dateUtc) / 86_400_000);
  if (Number.isNaN(diffDays) || diffDays < 0) return null;
  if (diffDays === 0) return today;
  if (diffDays === 1) return yesterday;
  if (diffDays < 7) {
    return new Date(dateUtc).toLocaleDateString(
      locale === "th" ? "th-TH" : "en-US",
      {
        weekday: "long",
        timeZone: "UTC",
      },
    );
  }
  return daysAgo(diffDays);
}

function getDateAfter(date: string): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  const result = d.toISOString().split("T")[0];
  if (!result) throw new Error("Invalid date");
  return result;
}
