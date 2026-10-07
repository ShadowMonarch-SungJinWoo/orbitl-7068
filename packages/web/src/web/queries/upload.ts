import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function usePresignUpload() {
  return useMutation(orpc.upload.presign.mutationOptions());
}

export function useIngestUpload() {
  const qc = useQueryClient();
  return useMutation(
    orpc.upload.ingest.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: orpc.notes.key() });
        qc.invalidateQueries({ queryKey: orpc.flashcards.key() });
        qc.invalidateQueries({ queryKey: orpc.quizzes.key() });
        qc.invalidateQueries({ queryKey: orpc.game.key() });
      },
    }),
  );
}
