import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useGroups() {
  return useQuery(orpc.groups.list.queryOptions());
}

export function useGroup(id: string) {
  return useQuery(orpc.groups.get.queryOptions({ input: { id }, enabled: !!id }));
}

export function useGroupMessages(groupId: string) {
  return useQuery(
    orpc.groups.messages.queryOptions({
      input: { groupId },
      enabled: !!groupId,
      refetchInterval: 4000,
    }),
  );
}

export function useGroupPreview(code: string) {
  return useQuery(
    orpc.groups.preview.queryOptions({ input: { code }, enabled: !!code, retry: false }),
  );
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: orpc.groups.key() });
}

export function useCreateGroup() {
  const invalidate = useInvalidate();
  return useMutation(orpc.groups.create.mutationOptions({ onSuccess: invalidate }));
}

export function useJoinGroup() {
  const invalidate = useInvalidate();
  return useMutation(orpc.groups.join.mutationOptions({ onSuccess: invalidate }));
}

export function useLeaveGroup() {
  const invalidate = useInvalidate();
  return useMutation(orpc.groups.leave.mutationOptions({ onSuccess: invalidate }));
}

export function usePostMessage() {
  const qc = useQueryClient();
  return useMutation(
    orpc.groups.postMessage.mutationOptions({
      onSuccess: (_d, vars) =>
        qc.invalidateQueries({ queryKey: orpc.groups.messages.queryOptions({ input: { groupId: vars.groupId } }).queryKey }),
    }),
  );
}

export function useShareNote() {
  const invalidate = useInvalidate();
  return useMutation(orpc.groups.shareNote.mutationOptions({ onSuccess: invalidate }));
}

export function useUnshareNote() {
  const invalidate = useInvalidate();
  return useMutation(orpc.groups.unshareNote.mutationOptions({ onSuccess: invalidate }));
}

export function useUpdateGroup() {
  const invalidate = useInvalidate();
  return useMutation(orpc.groups.update.mutationOptions({ onSuccess: invalidate }));
}

export function useRegenerateInvite() {
  const invalidate = useInvalidate();
  return useMutation(orpc.groups.regenerateInvite.mutationOptions({ onSuccess: invalidate }));
}

export function useDeleteGroup() {
  const invalidate = useInvalidate();
  return useMutation(orpc.groups.remove.mutationOptions({ onSuccess: invalidate }));
}

export function useRemoveMember() {
  const invalidate = useInvalidate();
  return useMutation(orpc.groups.removeMember.mutationOptions({ onSuccess: invalidate }));
}
