import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useNotes() {
  return useQuery(orpc.notes.list.queryOptions());
}

export function useNote(id: string) {
  return useQuery(orpc.notes.get.queryOptions({ input: { id }, enabled: !!id }));
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: orpc.notes.key() });
}

export function useCreateNote() {
  const invalidate = useInvalidate();
  return useMutation(orpc.notes.create.mutationOptions({ onSuccess: invalidate }));
}

export function useUpdateNote() {
  const invalidate = useInvalidate();
  return useMutation(orpc.notes.update.mutationOptions({ onSuccess: invalidate }));
}

export function useDeleteNote() {
  const invalidate = useInvalidate();
  return useMutation(orpc.notes.remove.mutationOptions({ onSuccess: invalidate }));
}

export function useAddComment() {
  const invalidate = useInvalidate();
  return useMutation(orpc.notes.addComment.mutationOptions({ onSuccess: invalidate }));
}
