import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

/**
 * Operator dashboard data. `whoami` doubles as the access check: the server
 * answers NOT_FOUND for non-admins, so a failed query simply means "not an
 * admin" and the nav entry stays hidden.
 */
export function useAdminWhoami() {
  return useQuery(
    orpc.admin.whoami.queryOptions({
      retry: false,
      staleTime: 5 * 60_000,
    }),
  );
}

export function useAdminOverview() {
  return useQuery(
    orpc.admin.overview.queryOptions({
      retry: false,
      refetchInterval: 30_000,
    }),
  );
}

export function useAdminErrors(limit = 50) {
  return useQuery(orpc.admin.errors.queryOptions({ input: { limit }, retry: false }));
}

export function useAdminSpendHistory(days = 14) {
  return useQuery(orpc.admin.spendHistory.queryOptions({ input: { days }, retry: false }));
}

export function useAdminBackups() {
  return useQuery(orpc.admin.backups.queryOptions({ retry: false }));
}

function useInvalidateAdmin() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: orpc.admin.key() });
}

export function useClearErrors() {
  const invalidate = useInvalidateAdmin();
  return useMutation(orpc.admin.clearErrors.mutationOptions({ onSuccess: invalidate }));
}

export function useBackupNow() {
  const invalidate = useInvalidateAdmin();
  return useMutation(orpc.admin.backupNow.mutationOptions({ onSuccess: invalidate }));
}

export function useBackupLink() {
  return useMutation(orpc.admin.backupLink.mutationOptions());
}

export function useRunJob() {
  const invalidate = useInvalidateAdmin();
  return useMutation(orpc.admin.runJob.mutationOptions({ onSuccess: invalidate }));
}
