import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export type ReportTarget = "group_message" | "note_comment" | "review";
export type ReportReason = "spam" | "abuse" | "harassment" | "violence" | "sexual" | "other";

/** Any signed-in user can report content. */
export function useReportContent() {
  return useMutation(orpc.moderation.report.mutationOptions());
}

/** Admin-only queue. Fails with NOT_FOUND for everyone else, so never retry. */
export function useModerationQueue(status: "open" | "actioned" | "dismissed" | "all" = "open") {
  return useQuery(orpc.moderation.queue.queryOptions({ input: { status }, retry: false }));
}

export function useHiddenContent() {
  return useQuery(orpc.moderation.hidden.queryOptions({ retry: false }));
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation(
    orpc.moderation.resolve.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: orpc.moderation.key() });
        // Hiding content changes what the group, note and review reads return.
        qc.invalidateQueries({ queryKey: orpc.groups.key() });
        qc.invalidateQueries({ queryKey: orpc.notes.key() });
        qc.invalidateQueries({ queryKey: orpc.reviews.key() });
      },
    }),
  );
}
