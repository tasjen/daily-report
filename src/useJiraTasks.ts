import { useQuery } from "@tanstack/react-query";
import { fetch } from "@tauri-apps/plugin-http";
import { useGlobalState } from "./store";
import type { JiraIssue } from "./type";

export function useJiraTasks(date: string) {
  const settings = useGlobalState((state) => state.settings);
  return useQuery({
    queryKey: ["jira_tasks", date],
    staleTime: Infinity,
    enabled: Boolean(settings),
    queryFn: async () => {
      if (!settings) return;
      const JIRA_DOMAIN = "https://living-insider.atlassian.net";
      const EMAIL = settings.email;
      const API_TOKEN = settings.api_token;
      return fetch(`${JIRA_DOMAIN}/rest/api/3/search/jql`, {
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
