import { useCallback, useMemo, useState } from 'react';
import { ArrowUpDown, Check, ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useCreatorFacets, useCreatorSearch } from '../../features/search/queries';
import { CREATOR_PAGE_SIZES, CREATOR_SORTS, DEFAULT_CREATOR_SORT, useCreatorRequest } from '../../features/search/request-state';
import { ErrorState } from '@/components/states';
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── view controls ────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-end gap-1.75 px-4.5 pt-2.25">
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
              label="Previous page"
              disabled={page <= 1}
              onClick={() => url.setParams({ page: page - 1 }, { replace: false })}
              icon={<ChevronLeft className="size-3.75" />}
            />
            <span className="text-xs tabular-nums text-rp-muted">
              Page {page} of {pages}
            </span>
            <PageButton
              label="Next page"
              disabled={page >= pages}
              onClick={() => url.setParams({ page: page + 1 }, { replace: false })}
              icon={<ChevronRight className="size-3.75" />}
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

function PageButton({
  label,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex cursor-pointer rounded-lg border border-rp-border bg-rp-surface p-1.5 text-rp-text disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
    </button>
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
