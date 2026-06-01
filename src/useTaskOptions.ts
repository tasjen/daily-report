import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useGlobalState } from "./store";
import type { SelectOption } from "./type";

export function useTaskOptions() {
  const settings = useGlobalState((state) => state.settings);
  return useQuery({
    queryKey: ["get_task_options"],
    staleTime: Infinity,
    enabled: Boolean(settings),
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
