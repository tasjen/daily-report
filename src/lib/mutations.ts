import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { taskParametersOptions } from "./queries";

export function useSubmitTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (arg: { date: string; summary: string }) => {
      await invoke("submit_task", arg);
    },
    onSuccess: (_, arg) => {
      queryClient.setQueryData(taskParametersOptions().queryKey, (data) => {
        if (!data) return;
        return {
          ...data,
          dates: data.dates.filter((e) => e.value !== arg.date),
        };
      });
    },
    onError: console.log,
  });
}
