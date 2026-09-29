import type { Column } from '@/components/DataTable';
import { ChipList, TierBadge } from '@/components/bits';
import { PlatformMark } from '@/components/PlatformMark';
import { MaskedContact } from '@/components/MaskedContact';
import { compact, formatNumber } from '@/lib/format';
import type { CreatorRow } from '@/types/api';

/**
 * Creator columns for the shared DataTable.
 *
 * The Creators section no longer uses these — it has its own table (see
 * CreatorTable.tsx), which needs row selection, a sticky header and the drawer.
 * These remain for the two places that show creators inside someone else's
 * screen: the combined search results, and the "top creators" block on a brand.
 * Both are short previews where the generic table is the right tool, so this
 * list is kept deliberately narrow — the full 13 columns belong to the section
 * that is actually about creators.
 */
export const creatorColumns: Column<CreatorRow>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: (row) => (
      <span className="flex flex-col">
        <span className="font-medium">{row.name}</span>
        <span className="text-[11px] text-muted-foreground">@{row.username}</span>
      </span>
    ),
    className: 'max-w-52 truncate',
  },
  {
    id: 'platform',
    header: 'Platform',
    cell: (row) => <PlatformMark platform={row.platform} size={16} />,
  },
  { id: 'tier', header: 'Tier', cell: (row) => <TierBadge tier={row.tier} /> },
  {
    id: 'followers',
    header: 'Followers',
    numeric: true,
    // Compact in the cell, exact on hover: a preview is for comparing, and
    // 3.79M lines up down a column where 3,791,204 does not.
    cell: (row) => <span title={formatNumber(row.followers)}>{compact(row.followers)}</span>,
  },
  {
    id: 'avg_views',
    header: 'Avg views',
    numeric: true,
    cell: (row) => <span title={formatNumber(row.avg_views)}>{compact(row.avg_views)}</span>,
  },
  { id: 'city', header: 'City', cell: (row) => row.city ?? '—' },
  {
    id: 'categories',
    header: 'Categories',
    cell: (row) => <ChipList items={row.categories} max={2} />,
  },
  {
    id: 'languages',
    header: 'Languages',
    cell: (row) => <ChipList items={row.languages} max={2} />,
  },
  {
    id: 'email',
    header: 'Email',
    cell: (row) => <MaskedContact value={row.emails[0] ?? null} kind="email" />,
    className: 'max-w-56',
  },
  {
    id: 'phone',
    header: 'Phone',
    cell: (row) => <MaskedContact value={row.phones[0] ?? null} kind="phone" />,
  },
];
