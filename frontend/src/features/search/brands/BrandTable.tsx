import { Building2 } from 'lucide-react';
import { DataTable, type Column } from '@/components/DataTable';
import { formatDate, formatNumber, initials } from '@/lib/format';
import type { BrandRow } from '@/types/api';
import { ExportDialog, type ExportScope } from '@/features/search/ExportDialog';
import { searchApi } from '@/lib/endpoints';
import { downloadCsv, fetchAllSearchRows, toCsv } from '@/lib/csv';

// ── BRAND TABLE PROPS ──────────────────────────────────────────

interface BrandTableProps {
  rows: BrandRow[];
  activeId: number | null;
  picked: Record<string, boolean>;
  onTogglePick: (id: string) => void;
  onTogglePage: () => void;
  onOpen: (row: BrandRow) => void;
  isLoading: boolean;
  isFetching: boolean;
  onSelectRange: (range: BrandRow[], shouldSelect: boolean) => void;
}

// ── BRAND TABLE COLUMNS ────────────────────────────────────────
const columns: Column<BrandRow>[] = [
  // Brand
  {
    id: 'brand',
    header: 'Brand',
    headerClassName: 'text-left w-25 text-[12px]',
    cell: (row) => (
      <span className="flex items-center gap-2.25">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-rp-border bg-rp-surface2 text-[10.5px] font-bold">
          {initials(row.name)}
        </span>

        <span className="min-w-0">
          <span className="block truncate font-semibold">
            {row.name}
          </span>

          <span className="block truncate text-[11px] text-rp-muted">
            {row.gstin || 'No GSTIN on file'}
          </span>
        </span>
      </span>
    ),
  },

  // Campaigns
  {
    id: 'campaigns',
    header: 'Campaigns',
    headerClassName: 'text-center w-24 text-[12px]',
    className: 'text-center tabular-nums',
    cell: (row) => formatNumber(row.campaign_count),
  },

  // Pitches
  {
    id: 'pitches',
    header: 'Pitches',
    headerClassName: 'text-center w-23 text-[12px]',
    className: 'text-center tabular-nums',
    cell: (row) => formatNumber(row.pitch_count),
  },

  // Creators
  {
    id: 'creators',
    header: 'Creators',
    headerClassName: 'text-center w-18 text-[12px]',
    className: 'text-center tabular-nums',
    cell: (row) => formatNumber(row.creator_count),
  },

  // Billing company
  {
    id: 'company',
    header: 'Billing company',
    headerClassName: 'text-center w-34 text-[12px]',
    className: 'text-center',
    cell: (row) =>
      row.company ? (
        <span className="flex items-center gap-1.5 truncate text-[12px]">
          <Building2 className="size-3 shrink-0 text-rp-muted" />
          <span className="truncate">{row.company.name}</span>
        </span>
      ) : (
        <span className="text-rp-muted">—</span>
      ),
  },

  // Last activity
  {
    id: 'activity',
    header: 'Last activity',
    headerClassName: 'text-left w-28 text-[12px]',
    cell: (row) => formatDate(row.latest_activity),
  },
];

// ── BRAND TABLE COMPONENT ──────────────────────────────────────

export function BrandTable({
  rows,
  activeId,
  picked,
  onTogglePick,
  onTogglePage,
  onOpen,
  isLoading,
  isFetching,
  onSelectRange,
}: BrandTableProps) {
  return (
    <DataTable
      appearance="results"
      rows={rows}
      columns={columns}
      rowKey={(row) => String(row.id)}
      onRowClick={onOpen}
      activeRowKey={activeId === null ? null : String(activeId)}
      isLoading={isLoading}
      isFetching={isFetching}
      selection={{
        picked,
        onTogglePick,
        onTogglePage,
        onSelectRange,
        label: (row) => row.name,
        headerClassName: 'w-15',
      }}
    />
  );
}