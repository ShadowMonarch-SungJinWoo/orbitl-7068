import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useGraph() {
  return useQuery(orpc.topics.graph.queryOptions({ staleTime: 10_000 }));
}

export function useTopicDetail(id: string) {
  return useQuery(orpc.topics.detail.queryOptions({ input: { id }, enabled: !!id }));
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: orpc.topics.key() });
    qc.invalidateQueries({ queryKey: orpc.subjects.key() });
  };
}

export function useCreateTopic() {
  const invalidate = useInvalidate();
  return useMutation(orpc.topics.create.mutationOptions({ onSuccess: invalidate }));
}

export function useUpdateTopic() {
  const invalidate = useInvalidate();
  return useMutation(orpc.topics.update.mutationOptions({ onSuccess: invalidate }));
}

export function useDeleteTopic() {
  const invalidate = useInvalidate();
  return useMutation(orpc.topics.remove.mutationOptions({ onSuccess: invalidate }));
}

export function useLinkTopics() {
  const invalidate = useInvalidate();
  return useMutation(orpc.topics.link.mutationOptions({ onSuccess: invalidate }));
}

export function useExplainTopic() {
  return useMutation(orpc.topics.explain.mutationOptions());
}
