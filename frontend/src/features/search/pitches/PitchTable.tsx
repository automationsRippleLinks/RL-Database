import { Link, useNavigate } from 'react-router-dom';
import {
  Check,
  CircleDashed,
  FileSpreadsheet,
} from 'lucide-react';

import { DataTable, type Column } from '@/components/DataTable';
import { PlatformMark } from '@/components/PlatformMark';
import {
  ORG_TYPE_LABELS,
  PITCH_REQUIREMENT_LABELS,
} from '@/lib/enums';
import { formatDate, formatNumber } from '@/lib/format';
import { withBackState } from '@/lib/navigation';
import type { PitchRow } from '@/types/api';



// ── PITCH TABLE COLUMNS ────────────────────────────────────────

const columns: Column<PitchRow>[] = [
  // Pitch
  {
    id: 'pitch',
    header: 'Pitch',
    headerClassName: 'text-left w-74',
    cell: (row) => (
      <>
        <span className="block truncate font-semibold">
          {row.campaign_name}
        </span>

        <span className="block truncate font-mono text-[10.5px] text-rp-muted">
          {row.pitch_code}
        </span>
      </>
    ),
  },

  // Brand
  {
    id: 'brand',
    header: 'Brand',
    headerClassName: 'text-left w-30',
    cell: (row) =>
      row.brand ? (
        <Link
          to={`/brands/${row.brand.id}`}
          state={withBackState(window.location).state}
          onClick={(event) => event.stopPropagation()}
          className="block truncate font-medium text-rp-primary hover:underline"
        >
          {row.brand.name}
        </Link>
      ) : (
        <span className="text-rp-muted italic">not linked</span>
      ),
  },

  // Platform
  {
    id: 'platform',
    header: 'Platform',
    headerClassName: 'text-left w-28',
    cell: (row) =>
      row.platform.length > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          {row.platform.filter(Boolean).map((platform, index) => (
            <PlatformMark
              key={`${platform}-${index}`}
              platform={platform}
              size={15}
            />
          ))}
        </span>
      ) : (
        <span className="text-rp-muted">—</span>
      ),
  },

  // Type
  {
    id: 'type',
    header: 'Type',
    headerClassName: 'text-left w-35',
    cell: (row) => (
      <>
        <span className="block truncate text-[11.5px]">
          {ORG_TYPE_LABELS[row.org_type] ?? row.org_type}
        </span>

        <span className="block truncate text-[10.5px] text-rp-muted">
          {PITCH_REQUIREMENT_LABELS[row.requirement] ??
            row.requirement}
        </span>
      </>
    ),
  },

  // Team
  {
    id: 'team',
    header: 'Team',
    headerClassName: 'text-left w-24',
    cell: (row) => (
      <>
        <span className="block truncate text-[12px] font-medium">
          {row.sales_lead}
        </span>

        {row.list_lead && (
          <span className="block truncate text-[10.5px] text-rp-muted">
            list: {row.list_lead}
          </span>
        )}
      </>
    ),
  },

  // Creators
  {
    id: 'creators',
    header: 'Creators',
    headerClassName: 'text-center w-18',
    className: 'text-center tabular-nums',
    cell: (row) => formatNumber(row.creator_count),
  },

  // Converted
  {
    id: 'converted',
    header: 'Converted',
    headerClassName: 'text-center w-39',
    className: 'text-center',
    cell: (row) => <ConvertedGlyph converted={row.converted} />,
  },

  // Created
  {
    id: 'created',
    header: 'Created',
    headerClassName: 'text-left w-24',
    cell: (row) => formatDate(row.created_at),
  },

  // Sheet
  {
    id: 'sheet',
    header: 'Sheet',
    headerClassName: 'text-center w-20',
    className: 'text-center',
    cell: (row) => <SheetLink href={row.spreadsheet_link} />,
  },
];

// ── PITCH TABLE COMPONENT ──────────────────────────────────────

interface PitchTableProps {
  rows: PitchRow[];
  picked: Record<string, boolean>;
  onTogglePick: (id: string) => void;
  onTogglePage: () => void;
  isLoading: boolean;
  isFetching: boolean;
  onSelectRange: (range: PitchRow[], shouldSelect: boolean) => void;
}

export function PitchTable({
  rows,
  picked,
  onTogglePick,
  onTogglePage,
  onSelectRange,
  isLoading,
  isFetching,
}: PitchTableProps) {
  const navigate = useNavigate();

  return (
    <DataTable
      appearance="results"
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      onRowClick={(row) =>
        navigate(
          `/pitches/${row.id}`,
          withBackState(window.location),
        )
      }
      isLoading={isLoading}
      isFetching={isFetching}
      selection={{
        picked,
        onTogglePick,
        onTogglePage,
        onSelectRange,
        label: (row) => row.campaign_name,
        headerClassName: 'w-15',
      }}
    />
  );
}

// ── PITCH CONVERSION STATUS ────────────────────────────────────

function ConvertedGlyph({ converted }: { converted: boolean }) {
  return converted ? (
    <span
      title="Converted to a campaign"
      aria-label="Converted"
      className="inline-flex text-rp-success"
    >
      <Check className="size-3.75" strokeWidth={3} />
    </span>
  ) : (
    <span
      title="Not converted"
      aria-label="Not converted"
      className="inline-flex text-rp-faint"
    >
      <CircleDashed className="size-3.75" />
    </span>
  );
}

// ── PITCH SHEET LINK ───────────────────────────────────────────

function SheetLink({ href }: { href: string | null }) {
  const tipClass =
    'pointer-events-none absolute right-0 bottom-full z-50 mb-0.5 border border-rp-muted bg-rp-surface px-2 py-0.5 text-[13px] font-normal whitespace-nowrap text-rp-text opacity-0 group-hover/tip:opacity-100';

  if (!href) {
    return (
      <span className="group/tip relative inline-flex text-rp-faint">
        <FileSpreadsheet className="size-3.75" />
        <span className={tipClass}>Not on file</span>
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Open sheet"
      onClick={(event) => event.stopPropagation()}
      className="group/tip relative inline-flex text-rp-primary hover:text-rp-text"
    >
      <FileSpreadsheet className="size-3.75" />
      <span className={tipClass}>Open sheet</span>
    </a>
  );
}