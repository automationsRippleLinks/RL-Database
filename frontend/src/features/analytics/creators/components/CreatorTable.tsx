import { useState, type Dispatch } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { searchApi } from '@/lib/endpoints';
import type { CreatorRow, SearchResponse } from '@/types/api';
import { FIELD_BY_KEY, PLATFORM_LABEL } from '../rules/config';
import { scoreCreator, type ScoredCreator } from '../calculations/score';
import type { ScoredKey } from '../types';
import { fmtN } from '../calculations/format';
import type { SortKey } from '../calculations/sort';
import type { Action, State } from '../state';
import { ChevRightIcon, DoneIcon, DownloadIcon, ExternalIcon, PlatformIcon, SearchIcon, SortIcon } from './Icons';
import { creatorsToCsv } from '../calculations/csv';
import { emptyMessage, filterSlug } from '../calculations/summary';
import { downloadTextFile } from '../utils/download';
import { tableRequest } from '../data/queries';

interface Props {
  query: UseQueryResult<SearchResponse<CreatorRow>>;
  state: State;
  dispatch: Dispatch<Action>;
}

const EXPORT_PAGE = 500;
/** Tags shown before "+N more". */
const TAGS_SHOWN = 2;

export function CreatorTable({ query, state, dispatch }: Props) {
  const data = query.data;
  const rows = (data?.rows ?? []).map(scoreCreator);
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

  const th = (key: SortKey, label: string) => {
    const on = state.sort.key === key;
    return (
      <th aria-sort={on ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" data-testid={`sort-${key}`} onClick={() => dispatch({ type: 'setSort', key })}>
          {label}
          <SortIcon dir={on ? state.sort.dir : null} />
        </button>
      </th>
    );
  };

  return (
    <section id="cc-table" className="cc-panel cc-results" aria-label="Creators needing attention">
      <div className="cc-res-head">
        <div className="cc-res-title">
          <h2>{state.field ? `Creators missing ${FIELD_BY_KEY[state.field].label.toLowerCase()}` : 'Creators needing attention'}</h2>
          <p data-testid="res-meta">{data ? `${fmtN(total)} ${total === 1 ? 'creator' : 'creators'}` : ''}</p>
        </div>
        <label className="cc-search">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search creators..."
            autoComplete="off"
            aria-label="Search creators by name or handle"
            value={state.q}
            onChange={(e) => dispatch({ type: 'setQuery', q: e.target.value })}
          />
        </label>
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

      <div className={`cc-tbl-wrap scrollbar-thin${query.isFetching && data ? ' cc-busy' : ''}`}>
        <table className="cc-ct">
          <thead>
            <tr>
              {th('name', 'Creator')}
              <th>Platform</th>
              {th('gaps', 'Missing details')}
              <th className="cc-view-h">View</th>
            </tr>
          </thead>
          <tbody>
            {query.isPending && (
              <tr>
                <td colSpan={4}>
                  <p className="cc-empty">Loading…</p>
                </td>
              </tr>
            )}
            {query.isError && (
              <tr>
                <td colSpan={4}>
                  <p className="cc-empty" role="alert">
                    Could not load creators.{' '}
                    <button type="button" className="cc-lnk" onClick={() => void query.refetch()}>
                      Try again
                    </button>
                  </p>
                </td>
              </tr>
            )}
            {data && !rows.length && (
              <tr>
                <td colSpan={4}>
                  <p className="cc-empty" data-testid="empty-table">
                    {emptyMessage(state)}{' '}
                    {filtered && (
                      <button type="button" className="cc-lnk" onClick={() => dispatch({ type: 'reset' })}>
                        Clear filters
                      </button>
                    )}
                  </p>
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <Row key={r.creator.id} r={r} selectedField={state.field} dispatch={dispatch} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="cc-pager">
        <span>
          Page {page} of {pages}
        </span>
        <div>
          <button type="button" data-testid="pg-prev" disabled={page <= 1} onClick={() => dispatch({ type: 'setPage', page: page - 1 })}>
            Previous
          </button>
          <button type="button" data-testid="pg-next" disabled={page >= pages} onClick={() => dispatch({ type: 'setPage', page: page + 1 })}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

/** Two letters from the name, on a soft colour that stays the same for the same creator. */
function Avatar({ name }: { name: string }) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((words[0]?.[0] ?? '?') + (words.length > 1 ? (words[words.length - 1][0] ?? '') : '')).toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span className="cc-av" style={{ '--hue': h } as React.CSSProperties} aria-hidden="true">
      {initials}
    </span>
  );
}

function Row({ r, selectedField, dispatch }: { r: ScoredCreator; selectedField: ScoredKey | null; dispatch: Dispatch<Action> }) {
  const c = r.creator;
  const open = () => dispatch({ type: 'openDrawer', id: c.id });
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? r.missing : r.missing.slice(0, TAGS_SHOWN);
  const more = r.missing.length - TAGS_SHOWN;

  return (
    <tr
      tabIndex={0}
      data-testid={`row-${c.id}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <td>
        <div className="cc-who-cell">
          <Avatar name={c.name} />
          <div className="cc-who-txt">
            <div className="cc-nm">{c.name}</div>
            {c.profile_url ? (
              <a className="cc-hd cc-hd-link" href={c.profile_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                @{c.username}
                <ExternalIcon />
              </a>
            ) : (
              <div className="cc-hd">@{c.username}</div>
            )}
          </div>
        </div>
      </td>
      <td>
        <PlatformIcon platform={c.platform} label={PLATFORM_LABEL[c.platform] ?? c.platform} />
      </td>
      <td>
        {r.missing.length === 0 ? (
          <span className="cc-done">
            <DoneIcon />
            Nothing missing
          </span>
        ) : (
          <div className="cc-tags">
            {shown.map((k) => (
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
            {more > 0 && (
              <button
                type="button"
                className="cc-more"
                aria-expanded={expanded}
                data-testid={`more-${c.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((x) => !x);
                }}
              >
                {expanded ? 'Show fewer' : `+${more} more`}
              </button>
            )}
          </div>
        )}
      </td>
      <td className="cc-view-c">
        <button type="button" className="cc-view-btn" aria-label={`View ${c.name}`} onClick={open}>
          <ChevRightIcon />
        </button>
      </td>
    </tr>
  );
}
