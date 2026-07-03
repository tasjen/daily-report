import { queryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { type Account, type Preferences, store } from "@/lib/store";
import type { JiraIssue, SelectOption } from "@/type";

export function accountOptions() {
  return queryOptions({
    // queryFn must not return undefined, so "no account yet" is null
    queryKey: ["account"],
    queryFn: async () => (await store.get<Account>("account")) ?? null,
  });
}

export function useAccount() {
  return useQuery(accountOptions());
}

export function preferencesOptions() {
  return queryOptions({
    queryKey: ["preferences"],
    queryFn: async () =>
      (await store.get<Preferences>("preferences")) ?? {
        default_project: null,
        project_list: [],
      },
  });
}

export function usePreferences() {
  return useQuery(preferencesOptions());
}

export function taskParametersOptions() {
  return queryOptions({
    queryKey: ["task_parameters"],
    staleTime: Infinity,
    queryFn: async () => {
      const result = await invoke<{
        dates: SelectOption[];
        leaves: SelectOption[];
        projects: SelectOption[];
      }>("get_task_parameters");
      return result;
    },
    retry: false,
  });
}

export function useTaskParameters(
  options?: ReturnType<typeof taskParametersOptions>,
) {
  const { data: account } = useAccount();
  return useQuery({
    ...taskParametersOptions(),
    enabled: Boolean(account),
    ...options,
  });
}

export function jiraTasksQueryOptions(jql: string, account?: Account | null) {
  return queryOptions({
    queryKey: ["jira_tasks", jql],
    staleTime: Infinity,
    queryFn: async () => {
      if (!account) return;
      const JIRA_DOMAIN = "https://living-insider.atlassian.net";
      const EMAIL = account.email;
      const API_TOKEN = account.api_token;
      const res = await tauriFetch(`${JIRA_DOMAIN}/rest/api/3/search/jql`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${EMAIL}:${API_TOKEN}`)}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jql,
          fields: ["status", "updated", "summary", "duedate"],
          maxResults: 50,
        }),
      });
      // Jira Cloud does not reject bad credentials here — it silently falls
      // back to anonymous access and returns 200 with zero issues, flagging
      // the failure only via this header (verified against this instance).
      // Without the check, a wrong email/API token looks like a day with no
      // issues. Absent header or "OK" means authenticated.
      const loginReason = res.headers.get("x-seraph-loginreason");
      if (loginReason && loginReason !== "OK") {
        throw new Error(
          `Jira authentication failed (${loginReason}) — check your Jira email and API token`,
        );
      }
      if (!res.ok) {
        // Non-auth failures (e.g. 400 from bad JQL) carry `errorMessages`
        // in the body; fall back to the HTTP status.
        const messages = await res
          .json()
          .then((body: { errorMessages?: string[] }) => body.errorMessages)
          .catch(() => undefined);
        throw new Error(
          messages?.length
            ? `Jira: ${messages.join("\n")}`
            : `Jira request failed (${res.status} ${res.statusText})`,
        );
      }
      return res.json() as Promise<{ issues: JiraIssue[] }>;
    },
  });
}

export function useJiraTasksQuery(
  jql: string,
  options?: Partial<ReturnType<typeof jiraTasksQueryOptions>>,
) {
  const { data: account } = useAccount();
  return useQuery({
    ...jiraTasksQueryOptions(jql, account),
    enabled: Boolean(account),
    ...options,
  });
}
