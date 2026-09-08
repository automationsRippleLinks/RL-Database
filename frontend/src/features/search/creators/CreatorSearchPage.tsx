import { useCallback, useMemo, useState } from 'react';
import { ArrowUpDown, Check, ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useCreatorFacets, useCreatorSearch } from '../queries';
import { CREATOR_PAGE_SIZES, CREATOR_SORTS, DEFAULT_CREATOR_SORT, useCreatorRequest } from '../request-state';
import { ErrorState } from '@/components/states';
import { useUrlSearchState } from '@/hooks/useUrlSearchState';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatNumber } from '@/lib/format';
import { rememberRecent } from '@/lib/recents';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { cn } from '@/lib/utils';
import type { CreatorRow } from '@/types/api';
import { useCreatorFilterModel } from '@/features/pulse/filters/useCreatorFilterModel';
import { useCampaignFacets } from '../queries';
import { useReportSectionCount, useShellState } from '@/features/pulse/shell-state';
import { CreatorDrawer } from './CreatorDrawer';
import { CreatorTable } from './CreatorTable';

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
  { key: 'email' as const, header: 'Email' },
  { key: 'phone' as const, header: 'Phone' },
];

export function CreatorSearchPage() {
  useDocumentTitle('Creators');

  const url = useUrlSearchState();
  const shell = useShellState();

  const facetsQuery = useCreatorFacets();
  const campaignFacets = useCampaignFacets();
  const request = useCreatorRequest(facetsQuery.data?.cities);
  const searchQuery = useCreatorSearch(request);
  const model = useCreatorFilterModel(facetsQuery.data, campaignFacets.data?.brands);

  const result = searchQuery.data;
  const rows = useMemo(() => result?.rows ?? [], [result]);

  // The rail shows this on the Creators nav row; only this page knows it.
  useReportSectionCount(result?.total);

  /**
   * Export selection, keyed by id — and the rows themselves, because a selection
   * survives paging and "Export 40 selected" has to work when 30 of them are on
   * pages you have left.
   */
  const [picked, setPicked] = useState<Record<string, CreatorRow>>({});
  const pickedFlags = useMemo(
    () => Object.fromEntries(Object.keys(picked).map((id) => [id, true])),
    [picked],
  );
  const pickedCount = Object.keys(picked).length;

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

  const exportCsv = () => {
    const selected = Object.values(picked);
    const toExport = selected.length ? selected : rows;
    if (!toExport.length) return;
    const name = selected.length
      ? `creators_selected_${selected.length}.csv`
      : `creators_page_${result?.page ?? 1}.csv`;
    downloadCsv(name, toCsv(toExport, CSV_COLUMNS));
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
      <div className="flex shrink-0 items-center justify-end gap-[7px] px-[18px] pt-[9px]">
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
          onClick={exportCsv}
          disabled={!rows.length && !pickedCount}
          className="inline-flex cursor-pointer items-center gap-[7px] rounded-[9px] border border-rp-border px-3 py-[7px] text-[12.5px] font-semibold hover:bg-rp-surface2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="size-3.5" />
          {pickedCount ? `Export ${pickedCount} selected` : 'Export page'}
        </button>
      </div>

      {/* ── results ──────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col px-[18px]">
        <div className="flex shrink-0 flex-wrap items-center gap-[9px] pt-2.5 pb-[9px]">
          <h1 className="text-[14.5px] font-bold">
            <span className="tabular-nums">{formatNumber(total)}</span>{' '}
            {total === 1 ? 'creator' : 'creators'}
          </h1>

          {model.pills.map((pill) => (
            <span
              key={pill.key}
              className="inline-flex items-center gap-1.5 rounded-full bg-rp-primary-soft py-1 pr-[7px] pl-2.5 text-[11.5px] font-semibold text-rp-primary"
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
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rp-primary-soft py-1 pr-[7px] pl-2.5 text-[11.5px] font-semibold text-rp-primary">
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
                model.actions.clearAll();
                url.setParams({ q: null }, { replace: true, resetPage: true });
              }}
              className="cursor-pointer rounded-full px-[9px] py-1 text-[11.5px] font-semibold text-rp-muted hover:bg-rp-surface2 hover:text-rp-text"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Tagged so the drawer's outside-click listener treats the results as
            part of the same surface: clicking another row swaps the record. */}
        <div
          data-rp-pop="results"
          className="min-h-0 flex-1 overflow-auto rounded-[13px] border border-rp-border bg-rp-surface"
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
            />
          )}
        </div>

        {/* ── paging ─────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between gap-3 pt-[9px] pb-3">
          <div className="flex items-center gap-[9px]">
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
              className="cursor-pointer rounded-lg border border-rp-border bg-rp-surface px-2 py-[5px] text-xs"
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
              icon={<ChevronLeft className="size-[15px]" />}
            />
            <span className="text-xs tabular-nums text-rp-muted">
              Page {page} of {pages}
            </span>
            <PageButton
              label="Next page"
              disabled={page >= pages}
              onClick={() => url.setParams({ page: page + 1 }, { replace: false })}
              icon={<ChevronRight className="size-[15px]" />}
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
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border border-rp-border px-[11px] py-[7px] text-[12.5px] font-semibold whitespace-nowrap"
      >
        <ArrowUpDown className="size-3.5" />
        {label}
      </button>

      {open && (
        <div className="animate-rp-menu absolute top-[calc(100%+6px)] right-0 z-50 min-w-[190px] rounded-xl border border-rp-border bg-rp-surface p-1.5 shadow-rp">
          {CREATOR_SORTS.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onPick(option.value)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-[9px] rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors',
                  active
                    ? 'bg-rp-primary-soft font-semibold text-rp-primary'
                    : 'font-medium text-rp-text hover:bg-rp-surface2',
                )}
              >
                <Check className={cn('size-[15px] shrink-0', !active && 'opacity-0')} strokeWidth={2.4} />
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
