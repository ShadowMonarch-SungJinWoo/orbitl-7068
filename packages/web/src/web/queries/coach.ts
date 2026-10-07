import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export type CoachView = "active" | "history" | "all";

export function useCoachMessages(view: CoachView = "active", limit = 20) {
  return useQuery(orpc.coach.list.queryOptions({ input: { view, limit } }));
}

export function useGenerateInsight() {
  const qc = useQueryClient();
  return useMutation(
    orpc.coach.generate.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: orpc.coach.key() }),
    }),
  );
}

export function useMarkInsightRead() {
  const qc = useQueryClient();
  return useMutation(
    orpc.coach.markRead.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: orpc.coach.key() }),
    }),
  );
}

/** Mark advice as acted on or dismissed — moves it into the history view. */
export function useSetInsightStatus() {
  const qc = useQueryClient();
  return useMutation(
    orpc.coach.setStatus.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: orpc.coach.key() }),
    }),
  );
}

/** Follow-up thread for one insight. Only fetched once a card is expanded. */
export function useInsightReplies(messageId: string | null) {
  return useQuery(
    orpc.coach.replies.queryOptions({
      input: { messageId: messageId ?? "" },
      enabled: !!messageId,
    }),
  );
}

export function useAskFollowUp() {
  const qc = useQueryClient();
  return useMutation(
    orpc.coach.followUp.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: orpc.coach.key() }),
    }),
  );
}
