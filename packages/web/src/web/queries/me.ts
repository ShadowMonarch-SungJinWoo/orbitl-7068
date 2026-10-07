import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useStatus() {
  return useQuery(orpc.me.status.queryOptions({ staleTime: 30_000 }));
}

/** Loads the optional demo dataset — only ever triggered explicitly by the user. */
export function useSeed() {
  const qc = useQueryClient();
  return useMutation(
    orpc.me.seed.mutationOptions({
      onSuccess: () => qc.invalidateQueries(),
    }),
  );
}

export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation(
    orpc.me.completeOnboarding.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: orpc.me.status.key() }),
    }),
  );
}

export function useResetData() {
  const qc = useQueryClient();
  return useMutation(
    orpc.me.resetData.mutationOptions({
      onSuccess: () => qc.invalidateQueries(),
    }),
  );
}

/** One-shot full data export. Triggered by a button, so it's a mutation. */
export function useExportData() {
  return useMutation(orpc.me.exportData.mutationOptions());
}

export function useEmailPrefs() {
  return useQuery(orpc.me.emailPrefs.queryOptions({ staleTime: 30_000 }));
}

export function useSetEmailPrefs() {
  const qc = useQueryClient();
  return useMutation(
    orpc.me.setEmailPrefs.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: orpc.me.emailPrefs.key() }),
    }),
  );
}
