import type { ScoredKey } from './types';
import { defaultDir, type SortKey, type SortState } from './calculations/sort';
import type { FilterState, ScopeKey } from './calculations/filters';

export type EditMode = 'fill' | 'edit';

export interface State extends FilterState {
  sort: SortState;
  page: number;
  /** Which filter dropdown is open. */
  open: ScopeKey | null;
  /** Creator id shown in the drawer. */
  drawer: string | null;
  /** Drawer edit form: fill the empty fields, or edit every field. null = just viewing. */
  edit: EditMode | null;
}

export const initialState: State = {
  plat: [],
  cat: [],
  lang: [],
  field: null,
  q: '',
  sort: { key: 'gaps', dir: 'desc' },
  page: 1,
  open: null,
  drawer: null,
  edit: null,
};

export type Action =
  | { type: 'toggleOption'; group: ScopeKey; value: string }
  | { type: 'clearGroup'; group: ScopeKey }
  | { type: 'toggleField'; field: ScoredKey }
  | { type: 'reset' }
  | { type: 'setSort'; key: SortKey }
  | { type: 'setPage'; page: number }
  | { type: 'setOpen'; group: ScopeKey | null }
  | { type: 'openDrawer'; id: string }
  | { type: 'closeDrawer' }
  | { type: 'setQuery'; q: string }
  | { type: 'togglePlatform'; plat: string }
  | { type: 'pickCell'; field: ScoredKey; plat: string }
  | { type: 'startEdit'; mode: EditMode }
  | { type: 'stopEdit' };

function toggled(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'toggleOption':
      return { ...s, [a.group]: toggled(s[a.group], a.value), page: 1 };
    case 'clearGroup':
      return { ...s, [a.group]: [], page: 1 };
    case 'toggleField':
      // Clicking a bar / the donut's missing slice lists the affected creators; clicking again clears it.
      return s.field === a.field ? { ...s, field: null, page: 1 } : { ...s, field: a.field, page: 1 };
    case 'togglePlatform':
      // A platform row filters everything (cards, bars, table) to that platform; clicking it again clears it.
      return s.plat.length === 1 && s.plat[0] === a.plat ? { ...s, plat: [], field: null, page: 1 } : { ...s, plat: [a.plat], field: null, page: 1 };
    case 'pickCell':
      // A heatmap cell = one field on one platform. Clicking the selected cell clears both.
      return s.field === a.field && s.plat.length === 1 && s.plat[0] === a.plat
        ? { ...s, field: null, plat: [], page: 1 }
        : { ...s, field: a.field, plat: [a.plat], page: 1 };
    case 'reset':
      return { ...s, plat: [], cat: [], lang: [], field: null, q: '', page: 1 };
    case 'setSort':
      return {
        ...s,
        sort: s.sort.key === a.key ? { key: a.key, dir: s.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: a.key, dir: defaultDir(a.key) },
        page: 1,
      };
    case 'setPage':
      return { ...s, page: a.page };
    case 'setOpen':
      return { ...s, open: a.group };
    case 'openDrawer':
      return { ...s, drawer: a.id, edit: null };
    case 'closeDrawer':
      return { ...s, drawer: null, edit: null };
    case 'setQuery':
      return { ...s, q: a.q, page: 1 };
    case 'startEdit':
      return { ...s, edit: a.mode };
    case 'stopEdit':
      return { ...s, edit: null };
  }
}
