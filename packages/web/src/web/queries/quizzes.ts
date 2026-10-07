import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useQuizzes() {
  return useQuery(orpc.quizzes.list.queryOptions());
}

export function useQuiz(id: string) {
  return useQuery(orpc.quizzes.get.queryOptions({ input: { id }, enabled: !!id }));
}

export function useQuizAttempts() {
  return useQuery(orpc.quizzes.attempts.queryOptions());
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: orpc.quizzes.key() });
    qc.invalidateQueries({ queryKey: orpc.topics.key() });
    qc.invalidateQueries({ queryKey: orpc.game.key() });
    qc.invalidateQueries({ queryKey: orpc.insights.key() });
  };
}

export function useGenerateQuiz() {
  const invalidate = useInvalidate();
  return useMutation(orpc.quizzes.generate.mutationOptions({ onSuccess: invalidate }));
}

export function useSubmitQuiz() {
  const invalidate = useInvalidate();
  return useMutation(orpc.quizzes.submit.mutationOptions({ onSuccess: invalidate }));
}

export function useDeleteQuiz() {
  const invalidate = useInvalidate();
  return useMutation(orpc.quizzes.remove.mutationOptions({ onSuccess: invalidate }));
}
