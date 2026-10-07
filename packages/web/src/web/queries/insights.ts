import { useMutation, useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export type Range = 7 | 30 | 90;

/** Filters shared by the whole Insights page — window plus optional subject scope. */
export interface InsightFilters {
  range: Range;
  subjectId: string | null;
}

export function useDashboard() {
  return useQuery(orpc.insights.dashboard.queryOptions({ staleTime: 10_000 }));
}

export function useAnalytics(filters: InsightFilters) {
  return useQuery(
    orpc.insights.analytics.queryOptions({
      input: { range: filters.range, subjectId: filters.subjectId },
      staleTime: 10_000,
    }),
  );
}

/**
 * The rows behind one chart point. Disabled until a point is actually selected so
 * opening the page never fires a drill-down query nobody asked for.
 */
export function useDrilldown(sel: { key: string; bucketDays: number; subjectId: string | null } | null) {
  return useQuery(
    orpc.insights.drilldown.queryOptions({
      input: { key: sel?.key ?? "", bucketDays: sel?.bucketDays ?? 1, subjectId: sel?.subjectId ?? null },
      enabled: !!sel,
      staleTime: 10_000,
    }),
  );
}

export function usePresign() {
  return useMutation(orpc.upload.presign.mutationOptions());
}

export function useIngest() {
  return useMutation(orpc.upload.ingest.mutationOptions());
}
