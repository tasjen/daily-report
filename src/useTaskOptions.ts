import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { SelectOption } from "./type";

export function useTaskOptions() {
  return useQuery({
    queryKey: ["get_task_options"],
    staleTime: Infinity,
    queryFn: async () => {
      const result = await invoke<{
        dates: SelectOption[];
        leaves: SelectOption[];
        projects: SelectOption[];
      }>("get_task_options");
      await getCurrentWindow().setFocus();
      return result;
    },
    retry: false,
  });
}
