import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  accountOptions,
  preferencesOptions,
  taskParametersOptions,
} from "./queries";
import { type Account, type Preferences, store } from "./store";

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
    onError: (error) => toast.error(String(error)),
  });
}

export function useSaveAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (account: Account) => {
      await store.set("account", account);
      await store.save();
      return account;
    },
    onSuccess: async (account) => {
      const previous = queryClient.getQueryData(accountOptions().queryKey);
      // close both browser sessions before updating the cache: the headless
      // one must log in again with the new account when setQueryData enables
      // the task_parameters query, and a lingering headed session would
      // submit tasks as the previous member
      if (previous) {
        await invoke("close_browsers");
      }
      queryClient.setQueryData(accountOptions().queryKey, account);
      await queryClient.invalidateQueries(taskParametersOptions());
    },
    onError: (error) => toast.error(String(error)),
  });
}

export function useSavePreferencesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (preferences: Preferences) => {
      await store.set("preferences", preferences);
      await store.save();
      return preferences;
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(preferencesOptions().queryKey, preferences);
    },
    onError: (error) => toast.error(String(error)),
  });
}
