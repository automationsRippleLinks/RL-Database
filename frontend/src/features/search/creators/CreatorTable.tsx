import { /* ListChecks, */ Mail, Mars, Phone, Transgender, Users, Venus, type LucideIcon } from 'lucide-react';
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
import { PlatformLink } from '@/components/PlatformMark';
import { deliverablesLabel } from './deliverables';
import { cn } from '@/lib/utils';
import { useState, type ComponentType } from 'react';

// ── COLUMN WIDTHS ──────────────────────────────────────────────
// Change the widths here, in one place. 1 unit = 4px (w-20 = 80px, w-64 = 256px).
// Only the header width counts: the table uses a fixed layout, so cell widths are ignored.
// Write each class out in full (w-24, not `w-${n}`) so Tailwind can find it.
// If the total is wider than the screen the table scrolls sideways; if it is
// narrower, the extra space is shared between the columns in proportion.

const COL = {
  select: 'w-12', //   40px  checkbox
  creator: 'w-45', //  256px avatar, name, @handle
  followers: 'w-16', // 80px
  views: 'w-36', //     92px
  location: 'w-20', //  80px
  gender: 'w-20', //   120px
  cost: 'w-28', //     112px
  cpv: 'w-35', //       80px
  categories: 'w-35', // 140px
  languages: 'w-25', // 100px
  contact: 'w-32', //  100px
} as const;

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
        headerClassName: COL.select,
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
      headerClassName: `text-left ${COL.creator} text-[12px]`, // was w-180 (720px)
      cell: (row) => <CreatorIdentity creator={row} />,
    },

    // Platform
    // {
    //   id: 'platform',
    //   header: 'Platform',
    //   headerClassName: 'text-center w-20 text-[12px]',
    //   className: 'w-20 text-center',
    //   cell: (row) => (
    //     <span className="inline-flex">
    //       <PlatformLink row={row} />        </span>
    //   ),
    // },

    // Followers
    {
      id: 'followers',
      header: 'Followers',
      headerClassName: `text-center ${COL.followers} text-[12px]`,
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
      headerClassName: `text-center ${COL.views} text-[12px]`,
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
      headerClassName: `text-left ${COL.location} text-[12px]`,
      cell: (row) => <CreatorLocation creator={row} />,
    },

    // Gender
    {
      id: 'gender',
      header: 'Gender',
      headerClassName: `text-center ${COL.gender} text-[12px]`,
      className: 'text-center',
      cell: (row) => <GenderGlyph gender={row.gender} />,
    },


    //cost
    {
      id: 'cost',
      header: 'Latest cost',
      headerClassName: `text-center ${COL.cost} text-[12px]`,
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
      headerClassName: `text-center ${COL.cpv} text-[12px]`,
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


    // Categories
    {
      id: 'categories',
      header: 'Categories',
      headerClassName: 'text-left w-44 text-[12px]',
      className: 'w-44', cell: (row) => <TextList items={row.categories} max={2} />,
    },

    // Languages
    {
      id: 'languages',
      header: 'Languages',
      headerClassName: `text-left ${COL.languages} text-[12px]`,
      cell: (row) => <TextList items={row.languages} max={1} />,
    },

    // Contact
    {
      id: 'contact',
      header: 'Contact',
      headerClassName: 'text-center w-25 text-[12px]',
      className: 'text-center w-32',
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

// ── AVATAR TINTS ───────────────────────────────────────────────

const AVATAR_TINTS = [
  'bg-violet-500/15 text-violet-300 border-violet-400/25',
  'bg-sky-500/15 text-sky-300 border-sky-400/25',
  'bg-emerald-500/15 text-emerald-300 border-emerald-400/25',
  'bg-amber-500/15 text-amber-300 border-amber-400/25',
  'bg-rose-500/15 text-rose-300 border-rose-400/25',
  'bg-teal-500/15 text-teal-300 border-teal-400/25',
];

function avatarTint(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

// ── CREATOR IDENTITY ───────────────────────────────────────────

// function CreatorIdentity({ creator }: { creator: CreatorRow }) {
//   const profileUrl = profileUrlFor(creator);

//   return (
//     // <span className="flex items-center gap-2.25">
//     //   <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-rp-border bg-rp-surface2 text-[10.5px] font-bold">
//     //     {initials(creator.name)}
//     //   </span>

//     //   <span className="min-w-0">
//     //     <span className="block font-semibold whitespace-nowrap">
//     //       {creator.name}
//     //     </span>

//     //     {profileUrl ? (
//     //       <a
//     //         href={profileUrl}
//     //         target="_blank"
//     //         rel="noreferrer noopener"
//     //         onClick={(event) => event.stopPropagation()}
//     //         className="block text-[11.5px] whitespace-nowrap text-rp-muted hover:underline"
//     //       >
//     //         @{creator.username}
//     //       </a>
//     //     ) : (
//     //       <span className="block text-[11.5px] whitespace-nowrap text-rp-muted">
//     //         @{creator.username}
//     //       </span>
//     //     )}
//     //   </span>
//     // </span>

//   );
// }
function CreatorIdentity({ creator }: { creator: CreatorRow }) {
  const profileUrl = profileUrlFor(creator);

  return (
    <span className="flex items-center gap-2.5">
      {/* avatar + platform badge */}
      <span className="relative shrink-0">
        <span
          className={cn(
            'flex size-7.5 items-center justify-center rounded-full border text-[10.5px] font-bold',
            avatarTint(creator.name),
          )}
        >
          {initials(creator.name)}
        </span>
        <span className="absolute -right-1 -bottom-1 flex rounded-full bg-rp-surface ring-2 ring-rp-surface">
          <PlatformLink row={creator} size={12} />
        </span>
      </span>

      {/* name + handle */}
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-semibold whitespace-nowrap">
          {creator.name}
          {/* Lists: turn back on once the backend sends list_count (add it to CreatorRow too).
          {!!creator.list_count && (
            <span
              title={`Saved in ${creator.list_count} ${creator.list_count === 1 ? 'list' : 'lists'}. Open the creator to see which.`}
              className="inline-flex items-center gap-1 rounded-full bg-rp-primary-soft px-1.5 py-px text-[10.5px] font-bold text-rp-primary"
            >
              <ListChecks className="size-2.75" aria-hidden="true" />
              {creator.list_count}
            </span>
          )}
          */}
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
// ── TEXT LIST (first items + "+N") ─────────────────────────────

function TextList({ items, max = 1 }: { items: string[]; max?: number }) {
  if (!items?.length) return <span className="text-rp-muted">—</span>;

  const shown = items.slice(0, max);
  const rest = items.length - shown.length;

  return (
    <span
      title={items.join(', ')}
      className="flex min-w-0 items-center gap-1.5 text-[12px] whitespace-nowrap"
    >
      <span className="truncate">{shown.join(', ')}</span>
      {rest > 0 && (
        <span className="shrink-0 rounded-full bg-rp-surface2 px-1.5 py-px text-[10.5px] font-semibold text-rp-muted">
          +{rest}
        </span>
      )}
    </span>
  );
}
// ── CREATOR GENDER ICONS ───────────────────────────────────────

// const GENDER_GLYPH: {
//   test: RegExp;
//   icon: LucideIcon;
// }[] = [
//     {
//       test: /^\s*(f|female|woman|women)\s*$/i,
//       icon: Venus,
//     },
//     {
//       test: /^\s*(m|male|man|men)\s*$/i,
//       icon: Mars,
//     },
//     {
//       test: /^\s*(nb|non[-\s]?binary|other|transgender|trans)\s*$/i,
//       icon: Transgender,
//     },
//   ];

// function GenderGlyph({ gender }: { gender: string | null }) {
//   if (!gender?.trim()) {
//     return <span className="text-rp-muted">—</span>;
//   }

//   const Icon = GENDER_GLYPH.find(({ test }) => test.test(gender))?.icon ?? Users;

//   return (
//     <span
//       title={gender}
//       aria-label={gender}
//       className="inline-flex text-rp-muted"
//     >
//       <Icon className="size-4.25" />
//     </span>
//   );
// }

// ── CREATOR GENDER ICONS ───────────────────────────────────

type GlyphProps = { className?: string };

/** Person in trousers. Drawn here, no icon file needed. */
function ManFigure({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="12" cy="4.5" r="2.5" />
      <path d="M9 8h6a2 2 0 0 1 2 2v5h-2v7h-2.5v-6h-1v6H9v-7H7v-5a2 2 0 0 1 2-2z" />
    </svg>
  );
}

/** Person in a dress. */
function WomanFigure({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="12" cy="4.5" r="2.5" />
      <path d="M10 8h4l3.5 8h-11z" />
      <path d="M9.5 16h2v6h-2z M12.5 16h2v6h-2z" />
    </svg>
  );
}

const GENDER_GLYPH: {
  test: RegExp;
  icon: ComponentType<GlyphProps>;
  color: string;
}[] = [
  {
    test: /^\s*(f|female|woman|women)\s*$/i,
    icon: WomanFigure,
    color: 'text-pink-300',
  },
  {
    test: /^\s*(m|male|man|men)\s*$/i,
    icon: ManFigure,
    color: 'text-sky-300',
  },
  {
    test: /^\s*(nb|non[-\s]?binary|other|transgender|trans)\s*$/i,
    icon: Transgender,
    color: 'text-violet-300',
  },
];

function GenderGlyph({ gender }: { gender: string | null }) {
  if (!gender?.trim()) {
    return <span className="text-rp-muted">—</span>;
  }

  const match = GENDER_GLYPH.find(({ test }) => test.test(gender));
  const Icon = match?.icon ?? Users;

  return (
    <span
      title={gender}
      aria-label={gender}
      className={cn('inline-flex', match?.color ?? 'text-rp-muted')}
    >
      <Icon className="size-6" />
    </span>
  );
} 






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