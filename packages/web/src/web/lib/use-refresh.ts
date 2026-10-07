import { useCallback, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";

/**
 * The manual refresh.
 *
 * Nothing in the app reloads the page or wipes the screen on its own, so this
 * is how a user asks for fresh server data: it re-fetches the queries that are
 * currently mounted and leaves every piece of local state — a running focus
 * timer, a half-finished quiz, an open form — exactly as it was.
 */
export function useRefreshAll() {
  const qc = useQueryClient();
  const fetching = useIsFetching();
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    setPending(true);
    try {
      await qc.invalidateQueries({ type: "active" });
    } finally {
      setPending(false);
    }
  }, [qc]);

  return { refresh, isRefreshing: pending || fetching > 0 };
}
