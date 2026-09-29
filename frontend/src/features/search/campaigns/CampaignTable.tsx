import { Link, useNavigate } from 'react-router-dom';
import {
  Check,
  CircleDashed,
  Clock,
  FileSpreadsheet,
  PauseCircle,
  Presentation,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { DataTable, type Column } from '@/components/DataTable';
import { MONTH_LABELS } from '@/lib/enums';
import { formatDate, formatNumber } from '@/lib/format';
import { withBackState } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import type { CampaignRow, CampaignStatus } from '@/types/api';


// ── CAMPAIGN TABLE PROPS ───────────────────────────────────────

interface CampaignTableProps {
  rows: CampaignRow[];
  picked: Record<string, boolean>;
  onTogglePick: (id: string) => void;
  onTogglePage: () => void;
  isLoading: boolean;
  isFetching: boolean;
  // ── SHIFT-CLICK RANGE SELECTION ────────────────────────────────
  onSelectRange: (range: CampaignRow[], shouldSelect: boolean) => void;

}

// ── CAMPAIGN TABLE COLUMNS ─────────────────────────────────────

const columns: Column<CampaignRow>[] = [
  // Campaign
  {
    id: 'campaign',
    header: 'Campaign',
    headerClassName: 'text-left w-52',
    cell: (row) => (
      <>
        <span className="block truncate font-semibold">
          {row.campaign_name}
        </span>

        <span className="block truncate font-mono text-[10.5px] text-rp-muted">
          {row.campaign_code}
        </span>
      </>
    ),
  },

  // Brand
  {
    id: 'brand',
    header: 'Brand',
    headerClassName: 'text-left w-40',
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

  // Period
  {
    id: 'period',
    header: 'Period',
    headerClassName: 'text-left w-30',
    cell: (row) =>
      `${MONTH_LABELS[row.month_name] ?? row.month_name} ${row.year}`,
  },

  // Status
  {
    id: 'status',
    header: 'Status',
    headerClassName: 'text-center w-18',
    className: 'text-center',
    cell: (row) => <StatusGlyph status={row.status} />,
  },

  // Report
  {
    id: 'report',
    header: 'Report',
    headerClassName: 'text-center w-45',
    className: 'text-center',
    cell: (row) => <StatusGlyph status={row.report_status} />,
  },

  // Team
  {
    id: 'team',
    header: 'Team',
    headerClassName: 'text-left w-38',
    cell: (row) => <CampaignTeam campaign={row} />,
  },

  // Duration
  {
    id: 'duration',
    header: 'Duration',
    headerClassName: 'text-left w-52',
    cell: (row) => (
      <span className="block whitespace-nowrap text-[11.5px] tabular-nums">
        {formatDate(row.start_date)}{' '}
        <span className="text-rp-muted">→</span>{' '}
        {formatDate(row.end_date ?? row.expected_end_date)}
      </span>
    ),
  },

  // Creators
  {
    id: 'creators',
    header: 'Creators',
    headerClassName: 'text-center w-35',
    className: 'text-center tabular-nums',
    cell: (row) => formatNumber(row.creator_count),
  },

  // Links
  {
    id: 'links',
    header: 'Links',
    headerClassName: 'text-center w-25',
    className: 'text-center',
    cell: (row) => (
      <span className="inline-flex items-center justify-center gap-2.5">
        <LinkGlyph
          href={row.spreadsheet_link}
          title="Open Sheet"
          icon={FileSpreadsheet}
        />

        <LinkGlyph
          href={row.report_link}
          title="Open PPT"
          icon={Presentation}
        />
      </span>
    ),
  },
];

// ── CAMPAIGN TABLE COMPONENT ───────────────────────────────────

export function CampaignTable({
  rows,
  picked,
  onTogglePick,
  onTogglePage,
  isLoading,
  isFetching,
  onSelectRange,
}: CampaignTableProps) {
  const navigate = useNavigate();

  return (
    <DataTable
      appearance="results"
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      onRowClick={(row) =>
        navigate(
          `/campaigns/${row.id}`,
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
        headerClassName: 'w-10',
      }}
    />
  );
}

// ── CAMPAIGN STATUS ICONS ──────────────────────────────────────

const STATUS_STYLE: Record<
  CampaignStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  wip: {
    label: 'WIP',
    icon: Clock,
    className: 'text-rp-primary',
  },
  completed: {
    label: 'Completed',
    icon: Check,
    className: 'text-rp-success',
  },
  'on hold': {
    label: 'On hold',
    icon: PauseCircle,
    className: 'text-rp-warn',
  },
  scrapped: {
    label: 'Scrapped',
    icon: XCircle,
    className: 'text-rp-danger',
  },
};

function StatusGlyph({ status }: { status: CampaignStatus }) {
  const style = STATUS_STYLE[status] ?? {
    label: status,
    icon: CircleDashed,
    className: 'text-rp-muted',
  };

  const Icon = style.icon;

  return (
    <span
      title={style.label}
      aria-label={style.label}
      className={cn('inline-flex items-center', style.className)}
    >
      <Icon className="size-3.75" />
    </span>
  );
}

// ── CAMPAIGN TEAM CELL ─────────────────────────────────────────

function CampaignTeam({ campaign }: { campaign: CampaignRow }) {
  const members = campaign.member_names.filter(
    (name) =>
      name?.trim() &&
      name.trim().toLowerCase() !==
      campaign.manager?.trim().toLowerCase(),
  );

  return (
    <span className="block min-w-0">
      <span className="block truncate text-[12px] font-semibold">
        {campaign.manager || '—'}
      </span>

      {members.length > 0 && (
        <span
          className="block truncate text-[11px] text-rp-muted"
          title={members.join(' · ')}
        >
          with {members[0]}
          {members.length > 1 ? ` +${members.length - 1}` : ''}
        </span>
      )}
    </span>
  );
}

// ── CAMPAIGN EXTERNAL LINKS ────────────────────────────────────

function LinkGlyph({
  href,
  title,
  icon: Icon,
}: {
  href: string | null;
  title: string;
  icon: LucideIcon;
}) {
  if (!href) {
    return (
      <span title="Not on file" className="inline-flex text-rp-faint">
        <Icon className="size-4" />
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={title}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex text-rp-primary hover:text-rp-text"
    >
      <Icon className="size-4" />
    </a>
  );
}