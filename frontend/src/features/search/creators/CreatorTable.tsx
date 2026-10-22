import { Mail, Mars, Phone, Transgender, Users, Venus, type LucideIcon } from 'lucide-react';
import { DataTable, type Column } from '@/components/DataTable';
import { useToast } from '@/components/Toast';
import {
  compact,
  formatNumber,
  initials,
  profileUrlFor,
  formatMonthYear,
  isOlderThanYear,
} from '@/lib/format';
import type { CreatorRow } from '@/types/api';
import { useState } from 'react';
import { PlatformLink } from '@/components/PlatformMark';
import { deliverablesLabel } from './deliverables';
import { cn } from '@/lib/utils';

// ── CREATOR TABLE PROPS ────────────────────────────────────────

interface CreatorTableProps {
  rows: CreatorRow[];
  activeId: string | null;
  picked: Record<string, boolean>;
  onTogglePick: (id: string) => void;
  onTogglePage: () => void;
  onOpen: (row: CreatorRow) => void;
  isLoading: boolean;
  isFetching: boolean;
  onSelectRange: (range: CreatorRow[], shouldSelect: boolean) => void;
}

// ── CREATOR TABLE COMPONENT ────────────────────────────────────

export function CreatorTable({
  rows,
  activeId,
  picked,
  onTogglePick,
  onTogglePage,
  onSelectRange,
  onOpen,
  isLoading,
  isFetching,
}: CreatorTableProps) {
  const { copy } = useToast();

  return (
    <DataTable
      appearance="results"
      rows={rows}
      columns={creatorColumns((value) => copy(value, 'Copied!'))}
      rowKey={(row) => row.id}
      onRowClick={onOpen}
      activeRowKey={activeId}
      isLoading={isLoading}
      isFetching={isFetching}
      selection={{
        picked,
        onTogglePick,
        onTogglePage,
        onSelectRange,
        label: (row) => row.name,
        headerClassName: 'w-10',
      }}
    />
  );
}

// ── CREATOR TABLE COLUMNS ──────────────────────────────────────

export function creatorColumns(
  onCopy: (value: string) => void,
): Column<CreatorRow>[] {
  return [
    // Creator
    {
      id: 'creator',
      header: 'Creator',
      headerClassName: 'text-left w-46 text-[12px]',
      className: 'w-180',
      cell: (row) => <CreatorIdentity creator={row} />,
    },

    // Platform
    {
      id: 'platform',
      header: 'Platform',
      headerClassName: 'text-center w-20 text-[12px]',
      className: 'w-20 text-center',
      cell: (row) => (
        <span className="inline-flex">
          <PlatformLink row={row} />        </span>
      ),
    },

    // Followers
    {
      id: 'followers',
      header: 'Followers',
      headerClassName: 'text-center w-20 text-[12px]',
      className: 'text-center tabular-nums',
      cell: (row) => (
        <span
          title={
            row.followers !== null
              ? `${formatNumber(row.followers)} followers`
              : undefined
          }
        >
          {compact(row.followers)}
        </span>
      ),
    },

    // Avg views
    {
      id: 'views',
      header: 'Avg views',
      headerClassName: 'text-center w-23 text-[12px]',
      className: 'text-center tabular-nums',
      cell: (row) => (
        <span
          title={
            row.avg_views !== null
              ? `${formatNumber(row.avg_views)} views per post`
              : undefined
          }
        >
          {compact(row.avg_views)}
        </span>
      ),
    },

    // Location
    {
      id: 'location',
      header: 'Location',
      headerClassName: 'text-left w-20 text-[12px]',
      cell: (row) => <CreatorLocation creator={row} />,
    },

    // Gender
    {
      id: 'gender',
      header: 'Gender',
      headerClassName: 'text-center w-30 text-[12px]',
      className: 'text-center',
      cell: (row) => <GenderGlyph gender={row.gender} />,
    },

    //cost
    // {
    //   id: 'cost',
    //   header: 'Latest cost',
    //   headerClassName: 'text-center w-28 text-[12px]',
    //   className: 'text-center tabular-nums',
    //   cell: (row) =>
    //     row.latest_cost ? (
    //       <span>₹{formatNumber(row.latest_cost)} </span>
    //     ) : (
    //       <span className="text-rp-muted">—</span>

    //     ),
    // },

    //cost
    {
      id: 'cost',
      header: 'Latest cost',
      headerClassName: 'text-center w-28 text-[12px]',
      className: 'text-center tabular-nums',
      cell: (row) => {
        if (!row.latest_cost) return <span className="text-rp-muted">—</span>;
        const when = formatMonthYear(row.latest_cost_month, row.latest_cost_year);
        const stale = isOlderThanYear(row.latest_cost_month, row.latest_cost_year);
        const source = row.latest_cost_source?.replace(/_/g, ' ');
        const deliverables = deliverablesLabel(row.latest_cost_deliverables);
        const tip = [
          `Latest cost: ₹${formatNumber(row.latest_cost)}`,
          `Followers: ${compact(row.followers)}`,
          when && `Month: ${when}`,
          source && `Source: ${source}`,
          deliverables && `For: ${deliverables}`,
          stale && 'Over a year old, confirm before pitching',
        ]
          .filter(Boolean)
          .join('\n');
        return (
          <span
            className={cn('cursor-help', stale && 'text-rp-danger')}
            title={tip}
          >
            ₹{formatNumber(row.latest_cost)}
            {when && (
              <span
                className={cn(
                  'block text-[10.5px]',
                  stale ? 'text-rp-danger' : 'text-rp-muted',
                )}
              >
                {when}
              </span>
            )}
          </span>
        );
      },
    },

    // CPV (cost per view)
    {
      id: 'cpv',
      header: 'CPV',
      headerClassName: 'text-center w-20 text-[12px]',
      className: 'text-center tabular-nums',
      cell: (row) =>
        row.latest_cost && row.avg_views ? (
          <span title="Latest cost ÷ average views">
            ₹{(row.latest_cost / row.avg_views).toFixed(2)}
          </span>
        ) : (
          <span className="text-rp-muted">—</span>
        ),
    },

    // CPV (cost per view) — worked out by the backend
    // {
    //   id: 'cpv',
    //   header: 'CPV',
    //   headerClassName: 'text-center w-20 text-[12px]',
    //   className: 'text-center tabular-nums',
    //   cell: (row) =>
    //     row.cpv != null ? (
    //       <span title="Latest cost ÷ average views">₹{row.cpv.toFixed(2)}</span>
    //     ) : (
    //       <span className="text-rp-muted">—</span>
    //     ),
    // },


    // Languages
    // {
    //   id: 'languages',
    //   header: 'Languages',
    //   headerClassName: 'text-left w-25 text-[12px]',
    //   cell: (row) => (
    //     <TruncatedList
    //       items={row.languages}
    //       overflowTitle="Also speaks"
    //     />
    //   ),
    // },

    // Categories
    // {
    //   id: 'categories',
    //   header: 'Categories',
    //   headerClassName: 'text-left w-28 text-[12px]',
    //   cell: (row) => (
    //     <TruncatedList
    //       items={row.categories}
    //       overflowTitle="Also"
    //     />
    //   ),
    // },

    // Contact
    {
      id: 'contact',
      header: 'Contact',
      headerClassName: 'text-center w-25 text-[12px]',
      className: 'text-center w-50',
      cell: (row) => (
        <span className="inline-flex items-center justify-center gap-5">
          <ContactGlyph
            value={row.emails[0] ?? null}
            title={row.emails.length ? 'Copy Email' : 'No email on file'}
            icon={Mail}
            onCopy={onCopy}
          />

          <ContactGlyph
            value={row.phones[0] ?? null}
            title={row.phones.length ? 'Copy number' : 'No phone on file'}
            icon={Phone}
            onCopy={onCopy}
          />
        </span>
      ),
    },
  ];
}

// ── CREATOR IDENTITY ───────────────────────────────────────────

function CreatorIdentity({ creator }: { creator: CreatorRow }) {
  const profileUrl = profileUrlFor(creator);

  return (
    <span className="flex items-center gap-2.25">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-rp-border bg-rp-surface2 text-[10.5px] font-bold">
        {initials(creator.name)}
      </span>

      <span className="min-w-0">
        <span className="block font-semibold whitespace-nowrap">
          {creator.name}
        </span>

        {profileUrl ? (
          <a
            href={profileUrl}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(event) => event.stopPropagation()}
            className="block text-[11.5px] whitespace-nowrap text-rp-muted hover:underline"
          >
            @{creator.username}
          </a>
        ) : (
          <span className="block text-[11.5px] whitespace-nowrap text-rp-muted">
            @{creator.username}
          </span>
        )}
      </span>
    </span>
  );
}

// ── CREATOR LOCATION ───────────────────────────────────────────

function CreatorLocation({ creator }: { creator: CreatorRow }) {
  const city = creator.city?.trim();
  const state = creator.state?.trim();
  const region = creator.region?.trim();

  const primary = city || state || region || '—';
  const secondary = city
    ? state || '—'
    : state
      ? region || '—'
      : null;

  return (
    <span className="block whitespace-nowrap">
      <span className="block text-[12px] font-medium leading-5">
        {primary}
      </span>

      {secondary && (
        <span className="block text-[10px] leading-4 text-rp-muted">
          {secondary}
        </span>
      )}
    </span>
  );
}

// ── CREATOR GENDER ICONS ───────────────────────────────────────

const GENDER_GLYPH: {
  test: RegExp;
  icon: LucideIcon;
}[] = [
    {
      test: /^\s*(f|female|woman|women)\s*$/i,
      icon: Venus,
    },
    {
      test: /^\s*(m|male|man|men)\s*$/i,
      icon: Mars,
    },
    {
      test: /^\s*(nb|non[-\s]?binary|other|transgender|trans)\s*$/i,
      icon: Transgender,
    },
  ];

function GenderGlyph({ gender }: { gender: string | null }) {
  if (!gender?.trim()) {
    return <span className="text-rp-muted">—</span>;
  }

  const Icon = GENDER_GLYPH.find(({ test }) => test.test(gender))?.icon ?? Users;

  return (
    <span
      title={gender}
      aria-label={gender}
      className="inline-flex text-rp-muted"
    >
      <Icon className="size-4.25" />
    </span>
  );
}

// ── CREATOR LANGUAGES AND CATEGORIES ──────────────────────────





// ── CREATOR CONTACT ACTIONS ────────────────────────────────────

function ContactGlyph({
  value,
  title,
  icon: Icon,
  onCopy,
}: {
  value: string | null;
  title: string;
  icon: LucideIcon;
  onCopy: (value: string) => void;
}) {
  const [clicked, setClicked] = useState(false); // true after a click, until the mouse leaves

  const label = (
    <span
      className={`pointer-events-none absolute right-0 bottom-full z-50 mb-0.5 border border-rp-muted bg-rp-surface px-2 py-0.5 text-[13px] font-normal whitespace-nowrap text-rp-text opacity-0 ${clicked ? '' : 'group-hover/tip:opacity-100'}`}
    >
      {title}
    </span>
  );

  if (!value) {
    return (
      <span aria-label={title} className="group/tip relative inline-flex text-rp-faint">
        <Icon className="size-4.25" />
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={title}
      onClick={(event) => {
        event.stopPropagation();
        onCopy(value);
        setClicked(true);
      }}
      onMouseLeave={() => setClicked(false)}
      className="group/tip relative inline-flex cursor-pointer text-rp-primary hover:text-rp-text"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}