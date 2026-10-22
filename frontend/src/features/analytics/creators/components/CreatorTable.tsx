import { useState, type Dispatch } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { searchApi } from '@/lib/endpoints';
import type { CreatorRow, SearchResponse } from '@/types/api';
import { DataTable, type Column } from '@/components/DataTable';
import { PageButton } from '@/components/bits';
import { cn } from '@/lib/utils';
import { creatorColumns } from '@/features/search/creators/CreatorTable';
import { CREATOR_PAGE_SIZES } from '@/features/search/request-state';
import { FIELD_BY_KEY } from '../rules/config';
import { scoreCreator } from '../calculations/score';
import type { ScoredKey } from '../types';
import { fmtN } from '../calculations/format';
import type { Action, State } from '../state';
import { DoneIcon, DownloadIcon, SortIcon } from './Icons';
import { creatorsToCsv } from '../calculations/csv';
import { emptyMessage, filterSlug } from '../calculations/summary';
import { downloadTextFile } from '../utils/download';
import { tableRequest } from '../data/queries';
import { TableSearch } from '@/components/TableSearch'

interface Props {
  query: UseQueryResult<SearchResponse<CreatorRow>>;
  state: State;
  dispatch: Dispatch<Action>;
}

const EXPORT_PAGE = 500;

/**
 * Creator and Platform come from the main Creators table, so both pages look the same.
 * Only their widths change: here they share the row with one wide Missing details column.
 */
const WIDTH: Record<string, string> = { creator: 'w-[25%]', platform: 'w-80' };
const SHARED_COLUMNS = creatorColumns(() => undefined)
  .filter((c) => c.id in WIDTH)
  .map((c) => ({ ...c, headerClassName: cn(c.headerClassName, WIDTH[c.id]) }));

export function CreatorTable({ query, state, dispatch }: Props) {
  const data = query.data;
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, data?.pages ?? 1);
  const page = Math.min(state.page, pages);
  const filtered = state.plat.length + state.cat.length + state.lang.length > 0 || state.field !== null || state.q.trim() !== '';
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  /** Every creator in the list, not just this page: fetched page by page, then saved as one CSV. */
  const download = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const all: CreatorRow[] = [];
      for (let p = 1; ; p++) {
        const res = await searchApi.creators(tableRequest(state, state.q, p, EXPORT_PAGE));
        all.push(...res.rows);
        if (p >= res.pages) break;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      downloadTextFile(`creators-${filterSlug(state)}-${stamp}.csv`, creatorsToCsv(all.map(scoreCreator)));
    } catch {
      setExportError('Could not export. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<CreatorRow>[] = [
    ...SHARED_COLUMNS,
    {
      id: 'missing',
      header: (
        <button
          type="button"
          className="inline-flex items-center gap-1 uppercase tracking-[0.05em] [&_svg]:size-[11px]"
          title="Most missing first / fewest missing first"
          data-testid="sort-gaps"
          onClick={() => dispatch({ type: 'setSort', key: 'gaps' })}
        >
          Missing details
          <SortIcon dir={state.sort.key === 'gaps' ? state.sort.dir : null} />
        </button>
      ),
      headerClassName: 'text-left text-[12px]',
      cell: (row) => <MissingChips row={row} selectedField={state.field} dispatch={dispatch} />,
    },
  ];

  return (
    <section id="cc-table" className="cc-panel cc-results" aria-label="Creators needing attention">
      <div className="cc-res-head">
        <div className="cc-res-title">
          <h2>{state.field ? `Creators missing ${FIELD_BY_KEY[state.field].label.toLowerCase()}` : 'Creators needing attention'}</h2>
          <p data-testid="res-meta">{data ? `${fmtN(total)} ${total === 1 ? 'creator' : 'creators'}` : ''}</p>
        </div>
        <TableSearch
          value={state.q}
          onChange={(q) => dispatch({ type: 'setQuery', q })}
          placeholder="Search creators..."
          label="Search creators by name or handle"
          className="w-70 max-w-full"
        />
        <button type="button" className="cc-btn cc-btn-primary cc-export" data-testid="download" disabled={!total || exporting} onClick={download}>
          <DownloadIcon />
          {exporting ? 'Exporting…' : 'Export'}
        </button>
      </div>
      {exportError && (
        <p className="cc-err cc-err-form cc-res-err" role="alert">
          {exportError}
        </p>
      )}

      <div className="cc-tbl-wrap scrollbar-thin">
        {query.isError ? (
          <p className="cc-empty" role="alert">
            Could not load creators.{' '}
            <button type="button" className="cc-lnk" onClick={() => void query.refetch()}>
              Try again
            </button>
          </p>
        ) : data && !rows.length ? (
          <p className="cc-empty" data-testid="empty-table">
            {emptyMessage(state)}{' '}
            {filtered && (
              <button type="button" className="cc-lnk" onClick={() => dispatch({ type: 'reset' })}>
                Clear filters
              </button>
            )}
          </p>
        ) : (
          <DataTable
            appearance="results"
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            onRowClick={(row) => dispatch({ type: 'openDrawer', id: row.id })}
            activeRowKey={state.drawer}
            isLoading={query.isPending}
            isFetching={query.isFetching && !!data}
          />
        )}
      </div>

      <div className="cc-pager">
        <div className="flex items-center gap-2.25">
          <span>
            {total === 0 ? 'No rows' : `Showing ${fmtN((page - 1) * state.size + 1)}–${fmtN(Math.min(page * state.size, total))} of ${fmtN(total)}`}
          </span>
          <select
            value={state.size}
            onChange={(e) => dispatch({ type: 'setSize', size: Number(e.target.value) })}
            title="Rows per page"
            aria-label="Rows per page"
            className="cursor-pointer rounded-lg border border-rp-border bg-rp-surface px-2 py-1.25 text-xs"
          >
            {CREATOR_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <PageButton label="Previous" disabled={page <= 1} onClick={() => dispatch({ type: 'setPage', page: page - 1 })} />
          <span>
            Page {page} of {pages}
          </span>
          <PageButton label="Next" disabled={page >= pages} onClick={() => dispatch({ type: 'setPage', page: page + 1 })} />
        </div>
      </div>
    </section>
  );
}

/** The dashboard's own column: one chip per missing detail. Clicking a chip lists everyone missing it. */
function MissingChips({ row, selectedField, dispatch }: { row: CreatorRow; selectedField: ScoredKey | null; dispatch: Dispatch<Action> }) {
  const missing = scoreCreator(row).missing;
  if (missing.length === 0) {
    return (
      <span className="cc-done">
        <DoneIcon />
        Nothing missing
      </span>
    );
  }
  return (
    <div className="cc-tags">
      {missing.map((k) => (
        <button
          key={k}
          type="button"
          className={`cc-tag${selectedField === k ? ' cc-sel' : ''}`}
          title={`List all creators missing ${FIELD_BY_KEY[k].label.toLowerCase()}`}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'toggleField', field: k });
          }}
        >
          {FIELD_BY_KEY[k].label}
        </button>
      ))}
    </div>
  );
}