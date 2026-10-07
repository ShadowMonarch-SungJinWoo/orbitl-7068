import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useSubjects() {
  return useQuery(orpc.subjects.list.queryOptions());
}

export function useSubject(id: string) {
  return useQuery(orpc.subjects.get.queryOptions({ input: { id }, enabled: !!id }));
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: orpc.subjects.key() });
    qc.invalidateQueries({ queryKey: orpc.topics.key() });
    qc.invalidateQueries({ queryKey: orpc.game.key() });
    qc.invalidateQueries({ queryKey: orpc.me.key() });
  };
}

export function useCreateSubject() {
  const invalidate = useInvalidate();
  return useMutation(orpc.subjects.create.mutationOptions({ onSuccess: invalidate }));
}

export function useUpdateSubject() {
  const invalidate = useInvalidate();
  return useMutation(orpc.subjects.update.mutationOptions({ onSuccess: invalidate }));
}

export function useDeleteSubject() {
  const invalidate = useInvalidate();
  return useMutation(orpc.subjects.remove.mutationOptions({ onSuccess: invalidate }));
}
