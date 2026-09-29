import { useMemo, useState } from 'react';
import { ArrowUpDown, Check, ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { usePitchFacets, usePitchSearch } from '../../features/search/queries';
import { CREATOR_PAGE_SIZES, PITCH_SORTS, usePitchRequest } from '../../features/search/request-state';
import { ErrorState } from '@/components/states';
import { useUrlSearchState } from '@/hooks/useUrlSearchState';
import { downloadCsv, fetchAllSearchRows, toCsv } from '@/lib/csv';
import { ORG_TYPE_LABELS, PITCH_REQUIREMENT_LABELS, PLATFORM_LABELS } from '@/lib/enums';
import { formatDate, formatNumber } from '@/lib/format';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { cn } from '@/lib/utils';
import type { PitchRow } from '@/types/api';
import { usePitchFilterModel } from '@/hooks/filterModels/usePitchFilterModel';
import { useReportSectionCount, useShellState } from '@/store/shell-state';
import { PitchTable } from '../../features/search/pitches/PitchTable';
import { searchApi } from '@/lib/endpoints';
import { ExportDialog, type ExportScope } from '@/features/search/ExportDialog';

/** toCsv needs flat keys — brand/platform get derived here rather than exported raw. */
interface PitchCsvRow {
  pitch_code: string;
  campaign_name: string;
  brand_name: string;
  org_type: string;
  requirement: string;
  platform: string;
  sales_lead: string;
  list_lead: string;
  creator_count: number;
  converted: string;
  created_at: string;
}

const CSV_COLUMNS: { key: keyof PitchCsvRow; header: string }[] = [
  { key: 'pitch_code', header: 'Code' },
  { key: 'campaign_name', header: 'Pitch' },
  { key: 'brand_name', header: 'Brand' },
  { key: 'org_type', header: 'Org type' },
  { key: 'requirement', header: 'Requirement' },
  { key: 'platform', header: 'Platform' },
  { key: 'sales_lead', header: 'Sales lead' },
  { key: 'list_lead', header: 'List lead' },
  { key: 'creator_count', header: 'Creators' },
  { key: 'converted', header: 'Converted' },
  { key: 'created_at', header: 'Created' },
];

function toCsvRow(row: PitchRow): PitchCsvRow {
  return {
    pitch_code: row.pitch_code,
    campaign_name: row.campaign_name,
    brand_name: row.brand?.name ?? '',
    org_type: ORG_TYPE_LABELS[row.org_type] ?? row.org_type,
    requirement: PITCH_REQUIREMENT_LABELS[row.requirement] ?? row.requirement,
    platform: row.platform.map((p) => PLATFORM_LABELS[p] ?? p).join('; '),
    sales_lead: row.sales_lead,
    list_lead: row.list_lead ?? '',
    creator_count: row.creator_count,
    converted: row.converted ? 'Yes' : 'No',
    created_at: formatDate(row.created_at),
  };
}

/**
 * Same page shell as CampaignSearchPage/BrandSearchPage — no drawer here
 * either, since PitchDetailPage stays a full page. See CampaignSearchPage
 * for the shell's own reasoning.
 */
export function PitchSearchPage() {
  useDocumentTitle('Pitches');

  const url = useUrlSearchState();
  const shell = useShellState();

  const facetsQuery = usePitchFacets();
  const request = usePitchRequest();
  const searchQuery = usePitchSearch(request);
  const model = usePitchFilterModel(facetsQuery.data);

  const result = searchQuery.data;
  const rows = useMemo(() => result?.rows ?? [], [result]);

  // The rail shows this on the Pitches nav row; only this page knows it.
  useReportSectionCount(result?.total);

  // Export selection, keyed by id, plus the rows themselves — a selection
  // survives paging, same pattern as Campaigns/Brands/Creators.
  // const [picked, setPicked] = useState<Record<string, PitchRow>>({});
  // ── PITCH SELECTION ACROSS PAGE NAVIGATION ─────────────────────
  const {
    pickedPitches: picked,
    setPickedPitches: setPicked,
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
  // ── SHIFT-CLICK RANGE SELECTION AND DESELECTION ────────────────
  const pickRange = (range: PitchRow[], shouldSelect: boolean) => {
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

  // ── PITCH CSV EXPORT ───────────────────────────────────────────
  const handleExport = async (scope: ExportScope) => {
    const toExport =
      scope === 'selected'
        ? Object.values(picked)
        : scope === 'current'
          ? rows
          : await fetchAllSearchRows(request, searchApi.pitches);

    if (!toExport.length) {
      throw new Error('No pitches to export.');
    }

    const suffix =
      scope === 'selected'
        ? `selected_${toExport.length}`
        : scope === 'current'
          ? `page_${result?.page ?? request.page}`
          : `all_${toExport.length}`;

    downloadCsv(
      `pitches_${suffix}.csv`,
      toCsv(toExport.map(toCsvRow), CSV_COLUMNS),
    );
  };

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
          Export         </button>
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
            {total === 1 ? 'pitch' : 'pitches'}
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
              onClick={() => model.actions.clearAll(true)}
              className="cursor-pointer rounded-full px-2.25 py-1 text-[11.5px] font-semibold text-rp-muted hover:bg-rp-surface2 hover:text-rp-text"
            >
              Clear all
            </button>
          )}
        </div>

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
            <PitchTable
              rows={rows}
              picked={pickedFlags}
              onTogglePick={togglePick}
              onTogglePage={togglePage}
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
  const current = PITCH_SORTS.find((option) => option.value === value);
  const label = current?.label ?? `Sorted by ${value}`;

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
          {PITCH_SORTS.map((option) => {
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

/** An empty table with no criteria means nothing's been ingested yet. */
function EmptyResults({ hasCriteria }: { hasCriteria: boolean }) {
  return (
    <div className="px-6 py-13 text-center">
      <p className="mb-1.5 text-[13.5px] font-bold">
        {hasCriteria ? 'Nothing matches' : 'No pitches in the database yet'}
      </p>
      <p className="text-[12.5px] text-rp-muted">
        {hasCriteria ? (
          'Remove a filter above, or try a shorter word.'
        ) : (
          <>
            Pitch rows arrive from the <code className="font-mono">pitch</code> uploads on the Ingest
            page.
          </>
        )}
      </p>
    </div>
  );
}
