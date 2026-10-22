import type { CreatorSummary } from '@/types/api';

/** Creators: how many have at least one missing tracked field, and how many have every field filled. The backend counts. */
export function creatorMetrics(summary: CreatorSummary) {
  const { total, with_gaps: missing } = summary.totals;
  return { total, missing, complete: total - missing };
}