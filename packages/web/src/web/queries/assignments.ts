import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useAssignments() {
  return useQuery(orpc.assignments.list.queryOptions());
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: orpc.assignments.key() });
    qc.invalidateQueries({ queryKey: orpc.game.key() });
    qc.invalidateQueries({ queryKey: orpc.insights.key() });
  };
}

export function useCreateAssignment() {
  const invalidate = useInvalidate();
  return useMutation(orpc.assignments.create.mutationOptions({ onSuccess: invalidate }));
}

export function useUpdateAssignment() {
  const invalidate = useInvalidate();
  return useMutation(orpc.assignments.update.mutationOptions({ onSuccess: invalidate }));
}

export function useDeleteAssignment() {
  const invalidate = useInvalidate();
  return useMutation(orpc.assignments.remove.mutationOptions({ onSuccess: invalidate }));
}
