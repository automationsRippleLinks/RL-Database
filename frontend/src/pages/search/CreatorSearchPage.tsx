import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, ArrowUpDown, Check, ChevronDown, Copy, Download, ListPlus, Trash2, X } from 'lucide-react';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ConfirmDialog';
import { BackLink } from '@/components/BackLink';
import { useToast } from '@/components/Toast';
import { useDismissable } from '@/hooks/useDismissable';
import { AddToListMenu } from '@/features/lists/AddToListMenu';
import { ListHeader, ListStatusTabs } from '@/features/lists/ListHeader';
import { listColumns, StatusPill } from '@/features/lists/ListColumns';
import { STATUSES, useList, useListActions } from '@/features/lists/queries';
import type { ListMember, ListStatus } from '@/types/api';
import { useCreatorFacets, useCreatorSearch } from '../../features/search/queries';
import { CREATOR_PAGE_SIZES, CREATOR_SORTS, DEFAULT_CREATOR_SORT, useCreatorRequest } from '../../features/search/request-state';
import { ErrorState } from '@/components/states';
import { PageButton } from '@/components/bits';
import { useUrlSearchState } from '@/hooks/useUrlSearchState';
import { downloadCsv, fetchAllSearchRows, toCsv } from '@/lib/csv';
import { formatNumber } from '@/lib/format';
import { rememberRecent } from '@/lib/recents';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { cn } from '@/lib/utils';
import type { CreatorRow } from '@/types/api';
import { useCreatorFilterModel } from '@/hooks/filterModels/useCreatorFilterModel';
import { useReportSectionCount, useShellState } from '@/store/shell-state';
import { CreatorDrawer } from '../../features/search/creators/CreatorDrawer';
import { CreatorTable } from '../../features/search/creators/CreatorTable';
import { searchApi } from '@/lib/endpoints';
import { ExportDialog, type ExportScope } from '@/features/search/ExportDialog';

const CSV_COLUMNS = [
  { key: 'name' as const, header: 'Name' },
  { key: 'username' as const, header: 'Handle' },
  { key: 'platform' as const, header: 'Platform' },
  { key: 'tier' as const, header: 'Tier' },
  { key: 'followers' as const, header: 'Followers' },
  { key: 'avg_views' as const, header: 'Avg views' },
  { key: 'city' as const, header: 'City' },
  { key: 'gender' as const, header: 'Gender' },
  // toCsv joins array cells with "; " (lib/csv.ts).
  { key: 'categories' as const, header: 'Categories' },
  { key: 'languages' as const, header: 'Languages' },
  { key: 'emails' as const, header: 'Email' },
  { key: 'phones' as const, header: 'Phone' },
];

export function CreatorSearchPage() {
  useDocumentTitle('Creators');

  const url = useUrlSearchState();
  const shell = useShellState();

  // ── LIST MODE: /search/creators?list=<id> is this same table, scoped to one list ──
  const listId = url.getString('list') || null;
  const listQuery = useList(listId);
  const list = listQuery.data ?? null;
  const members = useMemo(
    () => new Map<string, ListMember>((list?.members ?? []).map((m) => [m.creator_id, m])),
    [list],
  );
  const extraColumns = useMemo(() => (list ? listColumns(list.id, members, !list.can_edit) : []), [list, members]);

  const facetsQuery = useCreatorFacets();
  const request = useCreatorRequest(facetsQuery.data?.cities);
  const searchQuery = useCreatorSearch(request);
  // useCreatorFilterModel gets its brand list from facetsQuery itself
  // (CreatorFacets.brands) — it never took a second argument.
  const model = useCreatorFilterModel(facetsQuery.data);

  const result = searchQuery.data;
  const rows = useMemo(() => result?.rows ?? [], [result]);

  // The rail shows this on the Creators nav row; only this page knows it.
  useReportSectionCount(result?.total);

  /**
   * Export selection, keyed by id — and the rows themselves, because a selection
   * survives paging and "Export 40 selected" has to work when 30 of them are on
   * pages you have left.
   */
  // ── CREATOR SELECTION ACROSS PAGE NAVIGATION ───────────────────
  const {
    pickedCreators: picked,
    setPickedCreators: setPicked,
  } = shell;
  const pickedFlags = useMemo(
    () => Object.fromEntries(Object.keys(picked).map((id) => [id, true])),
    [picked],
  );
  const pickedCount = Object.keys(picked).length;
  const pickedIds = Object.keys(picked);
  // A selection belongs to where it was made: switching into or out of a list starts fresh.
  const lastScope = useRef(listId);
  useEffect(() => {
    if (lastScope.current !== listId) {
      lastScope.current = listId;
      setPicked({});
    }
  }, [listId, setPicked]);
  // ── EXPORT DIALOG STATE ────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);

  const togglePick = (id: string) => {
    setPicked((current) => {
      if (current[id]) {
        const next = { ...current };
        delete next[id];
        return next;
      }
      const row = rows.find((candidate) => candidate.id === id);
      return row ? { ...current, [id]: row } : current;
    });
  };

  const togglePage = () => {
    setPicked((current) => {
      const everyPicked = rows.length > 0 && rows.every((row) => current[row.id]);
      const next = { ...current };
      for (const row of rows) {
        if (everyPicked) delete next[row.id];
        else next[row.id] = row;
      }
      return next;
    });
  };
  // ── SHIFT-CLICK RANGE SELECTION AND DESELECTION ────────────────
  const pickRange = (range: CreatorRow[], shouldSelect: boolean) => {
    setPicked((current) => {
      const next = { ...current };

      for (const row of range) {
        if (shouldSelect) {
          next[row.id] = row;
        } else {
          delete next[row.id];
        }
      }

      return next;
    });
  };
  // ── CREATOR CSV EXPORT ─────────────────────────────────────────
  const handleExport = async (scope: ExportScope) => {
    const toExport =
      scope === 'selected'
        ? Object.values(picked)
        : scope === 'current'
          ? rows
          : await fetchAllSearchRows(request, searchApi.creators);

    if (!toExport.length) {
      throw new Error('No creators to export.');
    }

    const suffix =
      scope === 'selected'
        ? `selected_${toExport.length}`
        : scope === 'current'
          ? `page_${result?.page ?? request.page}`
          : `all_${toExport.length}`;

    downloadCsv(
      `creators_${suffix}.csv`,
      toCsv(toExport, CSV_COLUMNS),
    );
  };

  // The open creator lives in the URL, so a drawer is shareable, survives a
  // reload, and closes on the browser's Back the way people expect.
  const openCreatorId = url.getString('creator') || null;
  const openCreator = (row: CreatorRow) => {
    rememberRecent({ scope: 'creators', id: row.id, label: row.name });
    url.setParams({ creator: row.id }, { replace: false });

  };
  const closeDrawer = useCallback(
    () => url.setParams({ creator: null }, { replace: false }),
    [url],
  );

  const page = result?.page ?? request.page;
  const pages = Math.max(result?.pages ?? 1, 1);
  const total = result?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * request.page_size + 1;
  const to = Math.min(page * request.page_size, total);

  if (listId && listQuery.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-[14px] font-bold">This list no longer exists</p>
        <p className="text-[12.5px] text-rp-muted">Someone may have deleted it, or it is not shared with you.</p>
        <Link to="/lists" className="mt-2 rounded-lg border border-rp-border px-3 py-1.75 text-[12.5px] font-semibold hover:bg-rp-surface2">Back to Lists</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {list && <ListHeader list={list} />}
      {listId && !list && <div className="mx-4.5 mt-3 h-36 animate-pulse rounded-xl bg-rp-surface" aria-label="Loading the list" />}
      {/* ── view controls ────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.75 px-4.5 pt-2.25">
        {!listId && <BackLink className="mr-auto" />}
        {list && <ListStatusTabs list={list} />}
        <SortMenu
          value={request.sort}
          open={shell.openMenu === 'sort'}
          onToggle={() => shell.setOpenMenu(shell.openMenu === 'sort' ? null : 'sort')}
          onPick={(sort) => {
            url.setParams({ sort }, { replace: true, resetPage: true });
            shell.setOpenMenu(null);
          }}
        />
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          disabled={!rows.length && !pickedCount}
          className="inline-flex cursor-pointer items-center gap-1.75 rounded-[9px] border border-rp-border px-3 py-1.75 text-[12.5px] font-semibold hover:bg-rp-surface2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="size-3.5" />
          Export
        </button>
      </div>
      {/* ── EXPORT DIALOG ─────────────────────────────────────────── */}
      {exportOpen && (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          selectedCount={pickedCount}
          currentCount={rows.length}
          matchingCount={result?.total ?? 0}
          onExport={handleExport}
        />
      )}

      {/* ── results ──────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col px-4.5">
        <div className="flex shrink-0 flex-wrap items-center gap-2.25 pt-2.5 pb-2.25">
          <h1 className="text-[14.5px] font-bold">
            <span className="tabular-nums">{formatNumber(total)}</span>{' '}
            {total === 1 ? 'creator' : 'creators'}
            {list && <span className="font-medium text-rp-muted"> in this list</span>}
          </h1>

          {model.pills.map((pill) => (
            <span
              key={pill.key}
              className="inline-flex items-center gap-1.5 rounded-full bg-rp-primary-soft py-1 pr-1.75 pl-2.5 text-[11.5px] font-semibold text-rp-primary"
            >
              {pill.label}
              <button
                type="button"
                onClick={pill.remove}
                title="Remove this filter"
                aria-label={`Remove filter ${pill.label}`}
                className="flex cursor-pointer rounded-full p-px"
              >
                <X className="size-3" strokeWidth={2.6} />
              </button>
            </span>
          ))}

          {request.text && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rp-primary-soft py-1 pr-1.75 pl-2.5 text-[11.5px] font-semibold text-rp-primary">
              “{request.text}”
              <button
                type="button"
                onClick={() => url.setParams({ q: null }, { replace: true, resetPage: true })}
                title="Clear the search term"
                aria-label="Clear the search term"
                className="flex cursor-pointer rounded-full p-px"
              >
                <X className="size-3" strokeWidth={2.6} />
              </button>
            </span>
          )}

          {(model.totalApplied > 0 || request.text) && (
            <button
              type="button"
              onClick={() => {
                model.actions.clearAll(true);
              }}
              className="cursor-pointer rounded-full px-2.25 py-1 text-[11.5px] font-semibold text-rp-muted hover:bg-rp-surface2 hover:text-rp-text"
            >
              Clear all
            </button>
          )}
        </div>

        {pickedCount > 0 && (
          <SelectionBar
            count={pickedCount}
            ids={pickedIds}
            listId={list?.id ?? null}
            listName={list?.name ?? null}
            canEdit={list?.can_edit ?? true}
            onClear={() => setPicked({})}
            onExport={() => setExportOpen(true)}
          />
        )}

        {/* Tagged so the drawer's outside-click listener treats the results as
            part of the same surface: clicking another row swaps the record. */}
        <div
          data-rp-pop="results"
          className="min-h-0 flex-1 overflow-auto rounded-[13px] border border-rp-border bg-rp-surface scrollbar-thin"
        >
          {searchQuery.isError ? (
            <ErrorState
              error={searchQuery.error}
              onRetry={() => searchQuery.refetch()}
              className="border-0 bg-transparent"
            />
          ) : rows.length === 0 && !searchQuery.isPending ? (
            <EmptyResults hasCriteria={Boolean(request.text) || model.totalApplied > 0} />
          ) : (
            <CreatorTable
              rows={rows}
              activeId={openCreatorId}
              picked={pickedFlags}
              onTogglePick={togglePick}
              onTogglePage={togglePage}
              onOpen={openCreator}
              isLoading={searchQuery.isPending}
              isFetching={searchQuery.isFetching && !searchQuery.isPending}
              onSelectRange={pickRange}
              extraColumns={extraColumns}
            />
          )}
        </div>

        {/* ── paging ─────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between gap-3 pt-2.25 pb-3">
          <div className="flex items-center gap-2.25">
            <span className="text-xs tabular-nums text-rp-muted">
              {total === 0
                ? 'No rows'
                : `Showing ${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)}`}
            </span>
            <select
              value={request.page_size}
              onChange={(event) =>
                url.setParams({ size: event.target.value }, { replace: true, resetPage: true })
              }
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
            <PageButton
              label="Previous"
              disabled={page <= 1}
              onClick={() => url.setParams({ page: page - 1 }, { replace: false })}
            />
            <span className="text-xs tabular-nums text-rp-muted">
              Page {page} of {pages}
            </span>
            <PageButton
              label="Next"
              disabled={page >= pages}
              onClick={() => url.setParams({ page: page + 1 }, { replace: false })}
            />
          </div>
        </div>
      </div>

      {openCreatorId && <CreatorDrawer creatorId={openCreatorId} onClose={closeDrawer} />}
    </div>
  );
}

function SortMenu({
  value,
  open,
  onToggle,
  onPick,
}: {
  value: string;
  open: boolean;
  onToggle: () => void;
  onPick: (sort: string) => void;
}) {
  const current = CREATOR_SORTS.find((option) => option.value === value);
  const label =
    current?.label ??
    // A URL can carry a sort this menu doesn't offer — a bookmark from the old
    // list, or `relevance`. Naming it beats showing the wrong option as picked.
    (value === DEFAULT_CREATOR_SORT ? CREATOR_SORTS[0].label : `Sorted by ${value}`);

  return (
    <div data-rp-pop="menu" className="relative">
      <button
        type="button"
        onClick={onToggle}
        title="Sort"
        aria-expanded={open}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border border-rp-border px-2.75 py-1.75 text-[12.5px] font-semibold whitespace-nowrap"
      >
        <ArrowUpDown className="size-3.5" />
        {label}
      </button>

      {open && (
        <div className="animate-rp-menu absolute top-[calc(100%+6px)] right-0 z-50 min-w-47.5 rounded-xl border border-rp-border bg-rp-surface p-1.5 shadow-rp">
          {CREATOR_SORTS.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onPick(option.value)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.25 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors',
                  active
                    ? 'bg-rp-primary-soft font-semibold text-rp-primary'
                    : 'font-medium text-rp-text hover:bg-rp-surface2',
                )}
              >
                <Check className={cn('size-3.75 shrink-0', !active && 'opacity-0')} strokeWidth={2.4} />
                <span className="flex-1">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * An empty table with no criteria isn't a bad query — it's that nothing has been
 * ingested yet. Saying which upload fills this table beats a bare "no results"
 * that reads as a bug in the search.
 */
function EmptyResults({ hasCriteria }: { hasCriteria: boolean }) {
  return (
    <div className="px-6 py-13 text-center">
      <p className="mb-1.5 text-[13.5px] font-bold">
        {hasCriteria ? 'Nothing matches' : 'No creators in the database yet'}
      </p>
      <p className="text-[12.5px] text-rp-muted">
        {hasCriteria ? (
          'Remove a filter above, or try a shorter word.'
        ) : (
          <>
            Creator rows arrive from the <code className="font-mono">pitch_creator</code> and{' '}
            <code className="font-mono">campaign_creator</code> uploads on the Ingest page.
          </>
        )}
      </p>
    </div>
  );
}


/**
 * Appears as soon as anything is ticked. On the Creators page it saves the picks to a
 * list; inside a list it changes status, moves, copies or removes them.
 */
function SelectionBar({
  count,
  ids,
  listId,
  listName,
  canEdit,
  onClear,
  onExport,
}: {
  count: number;
  ids: string[];
  listId: string | null;
  listName: string | null;
  /** False when you can only view the open list: then only Copy to… and Export are offered. */
  canEdit: boolean;
  onClear: () => void;
  onExport: () => void;
}) {
  const act = useListActions();
  const { flash } = useToast();
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  useDismissable('bulk-status', statusOpen, () => setStatusOpen(false));
  const btn = 'inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border border-rp-border bg-rp-surface px-2.75 py-1.5 text-[12.5px] font-semibold hover:bg-rp-surface2';

  const setStatus = async (status: ListStatus) => {
    setStatusOpen(false);
    if (!listId) return;
    await Promise.all(ids.map((creatorId) => act.updateMember.mutateAsync({ id: listId, creatorId, body: { status } })));
    flash(`Marked ${ids.length} as ${status}`);
  };

  return (
    <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 rounded-[11px] border border-rp-primary/40 bg-rp-primary-soft px-3 py-1.75">
      <span className="text-[13px] font-bold tabular-nums">{formatNumber(count)} selected</span>
      <button type="button" onClick={onClear} className="cursor-pointer rounded-md px-1.5 py-1 text-[12.5px] font-semibold text-rp-primary hover:underline">
        Clear
      </button>
      <div className="ml-auto flex flex-wrap items-center gap-1.75">
        {listId && !canEdit ? (
          <>
            <AddToListMenu creatorIds={ids} mode="copy" fromListId={listId} onDone={onClear} trigger={<button type="button" className={btn}><Copy className="size-3.5" /> Copy to…</button>} />
            <button type="button" onClick={onExport} className={btn}><Download className="size-3.5" /> Export</button>
          </>
        ) : listId ? (
          <>
            <div data-rp-pop="bulk-status" className="relative">
              <button type="button" aria-expanded={statusOpen} onClick={() => setStatusOpen((o) => !o)} className={btn}>
                Set status <ChevronDown className="size-3.5" />
              </button>
              {statusOpen && (
                <div className="animate-rp-menu absolute top-[calc(100%+4px)] right-0 z-30 w-44 rounded-xl border border-rp-border bg-rp-surface p-1.25 shadow-rp">
                  {STATUSES.map((st) => (
                    <button key={st} type="button" onClick={() => void setStatus(st)} className="flex w-full cursor-pointer rounded-lg px-2 py-1.5 hover:bg-rp-surface2">
                      <StatusPill status={st} className="bg-transparent px-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <AddToListMenu creatorIds={ids} mode="move" fromListId={listId} onDone={onClear} trigger={<button type="button" className={btn}><ArrowRightLeft className="size-3.5" /> Move to…</button>} />
            <AddToListMenu creatorIds={ids} mode="copy" fromListId={listId} onDone={onClear} trigger={<button type="button" className={btn}><Copy className="size-3.5" /> Copy to…</button>} />
            <button type="button" onClick={onExport} className={btn}><Download className="size-3.5" /> Export</button>
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  title: `Remove ${count} ${count === 1 ? 'creator' : 'creators'} from ${listName}?`,
                  body: 'They stay in the database and in any other list. Their status and note in this list are lost.',
                  confirmLabel: 'Remove',
                  danger: true,
                  onConfirm: async () => {
                    const res = await act.removeCreators.mutateAsync({ id: listId, creatorIds: ids });
                    flash(`Removed ${res.removed} from ${listName}`);
                    onClear();
                  },
                })
              }
              className={cn(btn, 'text-rp-danger')}
            >
              <Trash2 className="size-3.5" /> Remove
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onExport} className={btn}><Download className="size-3.5" /> Export</button>
            <AddToListMenu
              creatorIds={ids}
              onDone={onClear}
              trigger={
                <button type="button" className="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] bg-rp-primary px-3 py-1.5 text-[12.5px] font-bold text-rp-primary-fg">
                  <ListPlus className="size-3.75" /> Add to list <ChevronDown className="size-3.5" />
                </button>
              }
            />
          </>
        )}
      </div>
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
