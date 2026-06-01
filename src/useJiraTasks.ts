import { useQuery } from "@tanstack/react-query";
import { fetch } from "@tauri-apps/plugin-http";
import { getStore } from "./getStore";
import type { JiraIssue } from "./type";

export function useJiraTasks(date: string) {
  return useQuery({
    queryKey: ["jira_tasks", date],
    staleTime: Infinity,

    queryFn: async () => {
      const store = await getStore();
      const JIRA_DOMAIN = "https://living-insider.atlassian.net";
      const EMAIL = await store.get<string>("email");
      const API_TOKEN = await store.get<string>("api_token");
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
