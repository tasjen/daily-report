import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DateOption } from "./type";

export function useTaskOptions() {
  return useQuery({
    queryKey: ["get_task_options"],
    staleTime: Infinity,
    queryFn: async () => {
      const result = await invoke<{
        dates: DateOption[];
        leaves: string[];
        projects: string[];
      }>("get_task_options");
      await getCurrentWindow().setFocus();
      return result;
    },
    retry: false,
  });
}
