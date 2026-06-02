import { queryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { type GlobalState, useGlobalState } from "@/store";
import type { JiraIssue, SelectOption } from "@/type";

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
      await getCurrentWindow().setFocus();
      return result;
    },
    retry: false,
  });
}

export function useTaskParameters(
  options?: ReturnType<typeof taskParametersOptions>,
) {
  const settings = useGlobalState((state) => state.settings);
  return useQuery({
    ...taskParametersOptions(),
    enabled: Boolean(settings),
    ...options,
  });
}

export function jiraTasksOptions(
  date: string,
  settings?: GlobalState["settings"],
) {
  return queryOptions({
    queryKey: ["jira_tasks", date],
    staleTime: Infinity,
    queryFn: async () => {
      if (!settings) return;
      const JIRA_DOMAIN = "https://living-insider.atlassian.net";
      const EMAIL = settings.email;
      const API_TOKEN = settings.api_token;
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
  options?: ReturnType<typeof jiraTasksOptions>,
) {
  const settings = useGlobalState((state) => state.settings);
  return useQuery({
    ...jiraTasksOptions(date, settings),
    enabled: Boolean(settings),
    ...options,
  });
}
