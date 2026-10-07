import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useSessions() {
  return useQuery(orpc.focus.list.queryOptions());
}

export function useFocusStats() {
  return useQuery(orpc.focus.stats.queryOptions({ staleTime: 30_000 }));
}

export function useCompleteSession() {
  const qc = useQueryClient();
  return useMutation(
    orpc.focus.complete.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: orpc.focus.key() });
        qc.invalidateQueries({ queryKey: orpc.game.key() });
        qc.invalidateQueries({ queryKey: orpc.insights.key() });
      },
    }),
  );
}

export function useReflectOnSession() {
  const qc = useQueryClient();
  return useMutation(
    orpc.focus.reflect.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: orpc.focus.key() }),
    }),
  );
}
