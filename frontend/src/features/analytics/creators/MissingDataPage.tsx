import { Link } from 'react-router-dom';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { useCreatorDetail } from '@/features/search/queries';
import type { CreatorSummary } from '@/types/api';
import { scoreCreator } from './calculations/score';
import type { FilterOptions } from './calculations/filters';
import { fmtN } from './calculations/format';
import { initialState, reducer } from './state';
import { NONE, PLATFORMS } from './rules/config';
import { useCreatorSummary, useMissingCreators } from './data/queries';
import { Charts } from './components/Charts';
import { CreatorDrawer } from './components/CreatorDrawer';
import { CreatorTable } from './components/CreatorTable';
import { FilterBar } from './components/FilterBar';
import { LockIcon, PencilIcon } from './components/Icons';
import '../tokens.css';
import './styles.css';
import '../analytics.css';

const byName = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);

/** The dropdowns' options and counts come from the summary, so they always agree with the numbers. */
function toOptions(summary: CreatorSummary | undefined): FilterOptions {
  const count = (list: { value: string; count: number }[] | undefined, value: string) => list?.find((o) => o.value === value)?.count ?? 0;
  const terms = (list: { value: string; count: number }[] | undefined, none: string) => [
    { value: NONE, label: none, count: count(list, NONE) },
    ...(list ?? [])
      .filter((o) => o.value !== NONE)
      .map((o) => ({ value: o.value, label: o.value, count: o.count }))
      .sort(byName),
  ];
  return {
    plat: PLATFORMS.map((p) => ({ value: p.key, label: p.label, count: count(summary?.options.platforms, p.key) })),
    cat: terms(summary?.options.categories, 'No category'),
    lang: terms(summary?.options.languages, 'No language'),
  };
}

/**
 * Creators data-quality dashboard, mounted inside the Ripple Pulse shell (Analytics > Creators).
 *
 * Every number comes from the backend: one summary call for the counts, bars and heatmap, and the normal
 * creator search (with the `missing` filter) for the table. Anyone signed in can view; the edit buttons
 * follow `can_edit` from /auth/me, and the backend checks it again on every save.
 */
export function MissingDataPage() {
  const { user } = useAuth();
  const canEdit = user?.permissions.can_edit ?? false;
  const [state, dispatch] = useReducer(reducer, initialState);
  const [toast, setToast] = useState<string | null>(null);

  const summary = useCreatorSummary(state);
  const table = useMissingCreators(state);
  const options = useMemo(() => toOptions(summary.data), [summary.data]);

  // The drawer reads the creator itself, so it stays open after a save even when the creator leaves the list.
  const detail = useCreatorDetail(state.drawer ?? undefined);
  const drawerCreator = detail.data ?? table.data?.rows.find((r) => r.id === state.drawer) ?? null;
  const drawerRow = useMemo(() => (drawerCreator ? scoreCreator(drawerCreator) : null), [drawerCreator]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Close an open dropdown on an outside click. Escape cancels an edit first, then closes the drawer, then a dropdown.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (state.open && !(e.target instanceof Element && e.target.closest('.cc-dd'))) dispatch({ type: 'setOpen', group: null });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (state.edit) dispatch({ type: 'stopEdit' });
      else if (state.drawer) dispatch({ type: 'closeDrawer' });
      else if (state.open) dispatch({ type: 'setOpen', group: null });
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [state.open, state.drawer, state.edit]);

  const s = summary.data;
  const total = s?.totals.total ?? 0;
  const withGaps = s?.totals.with_gaps ?? 0;

  return (
    <div className="cc-root">
      <div className="cc-app">
        <header className="cc-top">
          <div>
            <nav className="cc-crumbs" aria-label="Breadcrumb">
              <Link to="/analytics" data-testid="back">Analytics</Link>
              <span aria-hidden="true">/</span>
              <b>Creators</b>
            </nav>
            <div className="cc-titlerow">
              <h1 className="cc-title">Creator data</h1>
              <span className="cc-pill cc-pill-live" data-testid="live-pill">
                <i aria-hidden="true" />
                Live data
              </span>
              <span className="cc-pill" data-testid="access-pill">
                {canEdit ? <PencilIcon /> : <LockIcon />}
                {canEdit ? 'Can edit' : 'Read only'}
              </span>
            </div>
          </div>
        </header>

        <FilterBar options={options} state={state} dispatch={dispatch} />

        <section className="cc-strip" aria-label="Summary">
          <div className="cc-stat" data-testid="tile-total">
            <b className="cc-sv">{s ? fmtN(total) : '–'}</b>
            <span>Total creators</span>
          </div>
          <div className="cc-stat cc-stat-miss" data-testid="tile-affected">
            <b className="cc-sv">{s ? fmtN(withGaps) : '–'}</b>
            <span>Missing information</span>
          </div>
          <div className="cc-stat cc-stat-ok" data-testid="tile-complete">
            <b className="cc-sv">{s ? fmtN(total - withGaps) : '–'}</b>
            <span>Complete</span>
          </div>
        </section>

        {summary.isPending && <p className="cc-status">Loading…</p>}
        {summary.isError && (
          <p className="cc-status" role="alert">
            Could not load the numbers.{' '}
            <button type="button" className="cc-lnk" onClick={() => void summary.refetch()}>
              Try again
            </button>
          </p>
        )}
        {s && <Charts summary={s} state={state} dispatch={dispatch} />}

        <CreatorTable query={table} state={state} dispatch={dispatch} />

        <CreatorDrawer
          scored={drawerRow}
          canEdit={canEdit}
          edit={state.edit}
          onStartEdit={(mode) => dispatch({ type: 'startEdit', mode })}
          onEditDone={({ saved }) => {
            dispatch({ type: 'stopEdit' });
            if (saved) setToast(`Saved ${drawerCreator?.name ?? 'creator'}. The counts are updated.`);
          }}
          onClose={() => dispatch({ type: 'closeDrawer' })}
        />
        {toast && (
          <div className="cc-toast" role="status" data-testid="toast">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
