import type { CreatorSort } from '@/types/api';

export type SortKey = 'name' | 'followers' | 'gaps';
export interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

/** Default direction when a column is first clicked: most gaps first, biggest followers first. */
export function defaultDir(key: SortKey): 'asc' | 'desc' {
  return key === 'followers' || key === 'gaps' ? 'desc' : 'asc';
}

/** The sort name the backend's creator search understands. */
export function apiSort(sort: SortState): CreatorSort {
  return `${sort.key}_${sort.dir}` as CreatorSort;
}
