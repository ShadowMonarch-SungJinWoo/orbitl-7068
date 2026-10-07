import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useProfile() {
  return useQuery(orpc.game.profile.queryOptions({ staleTime: 5_000 }));
}

export function useAchievements() {
  return useQuery(orpc.game.achievements.queryOptions());
}

export function useXpEvents() {
  return useQuery(orpc.game.xpEvents.queryOptions());
}

export function useSetCosmetic() {
  const qc = useQueryClient();
  return useMutation(
    orpc.game.setCosmetic.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: orpc.game.key() }),
    }),
  );
}
