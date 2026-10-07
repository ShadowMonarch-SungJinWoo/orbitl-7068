import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useFlashcards(input?: { topicId?: string; subjectId?: string }) {
  return useQuery(orpc.flashcards.list.queryOptions({ input }));
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: orpc.flashcards.key() });
    qc.invalidateQueries({ queryKey: orpc.game.key() });
  };
}

export function useDueFlashcards(limit = 40) {
  return useQuery(orpc.flashcards.due.queryOptions({ input: { limit } }));
}

export function useCreateFlashcard() {
  const invalidate = useInvalidate();
  return useMutation(orpc.flashcards.create.mutationOptions({ onSuccess: invalidate }));
}

export function useDeleteFlashcard() {
  const invalidate = useInvalidate();
  return useMutation(orpc.flashcards.remove.mutationOptions({ onSuccess: invalidate }));
}

export function useReviewFlashcard() {
  const invalidate = useInvalidate();
  return useMutation(orpc.flashcards.review.mutationOptions({ onSuccess: invalidate }));
}

export function useGenerateFlashcards() {
  const invalidate = useInvalidate();
  return useMutation(orpc.flashcards.generate.mutationOptions({ onSuccess: invalidate }));
}
