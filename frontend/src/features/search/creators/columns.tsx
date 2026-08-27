import type { Column } from '@/components/DataTable';
import { ChipList, ExternalLink, PlatformBadge, TierBadge } from '@/components/bits';
import { MaskedContact } from '@/components/MaskedContact';
import { formatNumber, profileUrlFor } from '@/lib/format';
import type { CreatorRow } from '@/types/api';

/** The 13 columns the Streamlit table established, plus masked contact handling. */
export const creatorColumns: Column<CreatorRow>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: (row) => <span className="font-medium">{row.name}</span>,
    className: 'max-w-52 truncate',
  },
  {
    id: 'username',
    header: 'Handle',
    cell: (row) => <span className="text-muted-foreground">@{row.username}</span>,
    className: 'max-w-44 truncate',
  },
  { id: 'platform', header: 'Platform', cell: (row) => <PlatformBadge platform={row.platform} /> },
  { id: 'tier', header: 'Tier', cell: (row) => <TierBadge tier={row.tier} /> },
  {
    id: 'followers',
    header: 'Followers',
    numeric: true,
    cell: (row) => formatNumber(row.followers),
  },
  {
    id: 'avg_views',
    header: 'Avg views',
    numeric: true,
    cell: (row) => formatNumber(row.avg_views),
  },
  { id: 'city', header: 'City', cell: (row) => row.city ?? '—' },
  { id: 'gender', header: 'Gender', cell: (row) => row.gender ?? '—' },
  // The normalized arrays, same as the detail page. These used to render the
  // `*_raw` strings, which is why the table and the detail view disagreed: raw
  // is written once when the creator is inserted and never updated, while the
  // links accumulate across every sheet the creator appears on.
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
    cell: (row) => <MaskedContact value={row.email} kind="email" />,
    className: 'max-w-56',
  },
  {
    id: 'phone',
    header: 'Phone',
    cell: (row) => <MaskedContact value={row.phone} kind="phone" />,
  },
  {
    id: 'profile',
    header: 'Profile',
    cell: (row) => <ExternalLink href={profileUrlFor(row)} />,
  },
];
