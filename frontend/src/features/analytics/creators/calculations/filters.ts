import type { ScoredKey } from '../types';

/**
 * Two layers of filtering:
 *  - SCOPE (platform / category / language): decides which creators every number and chart is about.
 *    These go to the summary endpoint and to the table's search.
 *  - DRILL (missing field / search): narrows only the table, so clicking a bar never makes the chart collapse.
 */
export interface ScopeState {
  plat: string[];
  cat: string[];
  lang: string[];
}
export interface DrillState {
  field: ScoredKey | null;
  q: string;
}
export type FilterState = ScopeState & DrillState;
export type ScopeKey = keyof ScopeState;

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}
export interface FilterOptions {
  plat: FilterOption[];
  cat: FilterOption[];
  lang: FilterOption[];
}
