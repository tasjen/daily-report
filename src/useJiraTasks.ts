import { useQuery } from "@tanstack/react-query";
import { useStore } from "./App";
import { fetch } from "@tauri-apps/plugin-http";
import { JiraIssue } from "./type";

export function useJiraTasks(date: Date) {
  const dateString = date.toISOString().split("T")[0];
  const store = useStore();
  return useQuery({
    queryKey: ["tasks", dateString],
    staleTime: Infinity,

    queryFn: async () => {
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
          jql: `project = FLEX AND status CHANGED BY currentUser() DURING ("${dateString} 00:00", "${dateString} 23:59")`,
          fields: ["status", "updated", "summary", "duedate"],
          maxResults: 10,
        }),
      }).then((res) => {
        return res.json() as Promise<{ issues: JiraIssue[] }>;
      });
    },
  });
}
