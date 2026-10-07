import { Link } from 'react-router-dom';
import type { Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { BrandLink, ExternalLink, OrgTypeBadge, PlatformBadges, RequirementBadge } from '@/components/bits';
import { formatDate, formatNumber } from '@/lib/format';
import type { PitchRow } from '@/types/api';

export const pitchColumns: Column<PitchRow>[] = [
  {
    id: 'code',
    header: 'Code',
    cell: (row) => (
      <Link
        to={`/pitches/${row.id}`}
        onClick={(event) => event.stopPropagation()}
        className="font-mono text-xs text-primary hover:underline"
      >
        {row.pitch_code}
      </Link>
    ),
  },
  {
    id: 'brand',
    header: 'Brand',
    cell: (row) => <BrandLink brand={row.brand} emphasis="medium" />,
    className: 'max-w-48 truncate',
  },
  {
    id: 'campaign',
    header: 'Campaign',
    cell: (row) => row.campaign_name,
    className: 'max-w-64 truncate',
  },
  { id: 'org_type', header: 'Org type', cell: (row) => <OrgTypeBadge orgType={row.org_type} /> },
  {
    id: 'requirement',
    header: 'Requirement',
    cell: (row) => <RequirementBadge requirement={row.requirement} />,
  },
  { id: 'platform', header: 'Platform', cell: (row) => <PlatformBadges platforms={row.platform} /> },
  { id: 'sales_lead', header: 'Sales lead', cell: (row) => row.sales_lead },
  {
    id: 'list_lead',
    header: 'List lead',
    cell: (row) => row.list_lead ?? <span className="text-muted-foreground">—</span>,
  },
  { id: 'creators', header: 'Creators', numeric: true, cell: (row) => formatNumber(row.creator_count) },
  {
    id: 'converted',
    header: 'Converted',
    cell: (row) =>
      row.converted ? (
        <Badge variant="success">Yes</Badge>
      ) : (
        <Badge variant="outline">No</Badge>
      ),
  },
  { id: 'created', header: 'Created', cell: (row) => formatDate(row.created_at) },
  {
    id: 'sheet',
    header: 'Sheet',
    cell: (row) => <ExternalLink href={row.spreadsheet_link} />,
  },
];
