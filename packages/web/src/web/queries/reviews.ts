import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export type ReviewSort = "top" | "recent" | "rating";
export type ReviewCategory = "general" | "graph" | "tutor" | "focus" | "gamification" | "bug" | "idea";

export function useReviews(input: { sort: ReviewSort; category: ReviewCategory | null; limit?: number }) {
  return useQuery(
    orpc.reviews.list.queryOptions({
      input: { sort: input.sort, category: input.category, limit: input.limit ?? 50 },
    }),
  );
}

/** Public — used by the marketing home page. */
export function useTopReviews(limit = 3) {
  return useQuery(orpc.reviews.top.queryOptions({ input: { limit }, staleTime: 60_000 }));
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: orpc.reviews.key() });
}

export function useCreateReview() {
  const invalidate = useInvalidate();
  return useMutation(orpc.reviews.create.mutationOptions({ onSuccess: invalidate }));
}

export function useUpdateReview() {
  const invalidate = useInvalidate();
  return useMutation(orpc.reviews.update.mutationOptions({ onSuccess: invalidate }));
}

export function useDeleteReview() {
  const invalidate = useInvalidate();
  return useMutation(orpc.reviews.remove.mutationOptions({ onSuccess: invalidate }));
}

export function useVoteReview() {
  const invalidate = useInvalidate();
  return useMutation(orpc.reviews.vote.mutationOptions({ onSuccess: invalidate }));
}
