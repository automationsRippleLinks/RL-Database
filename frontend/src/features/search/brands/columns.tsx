import { Link } from 'react-router-dom';
import { withBackState } from '@/lib/navigation';
import type { Column } from '@/components/DataTable';
import { OrgTypeBadge, PlatformBadges } from '@/components/bits';
import { formatDate, formatNumber } from '@/lib/format';
import type { BrandRow } from '@/types/api';

export const brandColumns: Column<BrandRow>[] = [
  {
    id: 'brand',
    header: 'Brand',
    cell: (row) => (
      <Link
        to={`/brands/${row.id}`}
        state={withBackState(window.location).state}
        onClick={(event) => event.stopPropagation()}
        className="font-medium text-primary hover:underline"
      >
        {row.name}
      </Link>
    ),
    className: 'max-w-56 truncate',
  },
  {
    id: 'company',
    header: 'Billing company',
    cell: (row) =>
      row.company?.name ?? <span className="text-muted-foreground italic">not linked</span>,
    className: 'max-w-64 truncate',
  },
  {
    id: 'gstin',
    header: 'GSTIN',
    // The brand's own GSTIN. Its owning company has a separate one, shown on the
    // brand detail page rather than crowded into this table.
    cell: (row) =>
      row.gstin ? (
        <span className="font-mono text-xs">{row.gstin}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: 'org_types',
    header: 'Org type',
    cell: (row) =>
      row.org_types.length ? (
        <span className="flex flex-wrap gap-1">
          {row.org_types.map((orgType) => (
            <OrgTypeBadge key={orgType} orgType={orgType} />
          ))}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  { id: 'platforms', header: 'Platforms', cell: (row) => <PlatformBadges platforms={row.platforms} /> },
  { id: 'campaigns', header: 'Campaigns', numeric: true, cell: (row) => formatNumber(row.campaign_count) },
  { id: 'pitches', header: 'Pitches', numeric: true, cell: (row) => formatNumber(row.pitch_count) },
  { id: 'creators', header: 'Creators', numeric: true, cell: (row) => formatNumber(row.creator_count) },
  { id: 'latest', header: 'Last activity', cell: (row) => formatDate(row.latest_activity) },
];
