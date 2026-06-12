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

export function jiraTasksOptions(date: string, account?: Account | null) {
  return queryOptions({
    queryKey: ["jira_tasks", date],
    staleTime: Infinity,
    queryFn: async () => {
      if (!account) return;
      const JIRA_DOMAIN = "https://living-insider.atlassian.net";
      const EMAIL = account.email;
      const API_TOKEN = account.api_token;
      return tauriFetch(`${JIRA_DOMAIN}/rest/api/3/search/jql`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${EMAIL}:${API_TOKEN}`)}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jql: `status CHANGED BY currentUser() DURING ("${date} 00:00", "${date} 23:59")`,
          fields: ["status", "updated", "summary", "duedate"],
          maxResults: 50,
        }),
      }).then((res) => {
        return res.json() as Promise<{ issues: JiraIssue[] }>;
      });
    },
  });
}

export function useJiraTasks(
  date: string,
  options?: Partial<ReturnType<typeof jiraTasksOptions>>,
) {
  const { data: account } = useAccount();
  return useQuery({
    ...jiraTasksOptions(date, account),
    enabled: Boolean(account),
    ...options,
  });
}
