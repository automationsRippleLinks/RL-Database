import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/UI/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/DataTable';
import { ErrorState, LoadingState } from '@/components/states';
import { StatRow, StatTile } from '@/components/StatTile';
import { Badge } from '@/components/ui/badge';
import { PlatformMark } from '@/components/PlatformMark';
import { PLATFORM_LABELS } from '@/lib/enums';
import {
  BrandLink,
  DefinitionItem,
  DefinitionList,
  OrgTypeBadge,
  PlatformBadges,
  RequirementBadge,
  SectionTitle,
  TierBadge,
} from '@/components/bits';
import { formatCurrency, formatDateTime, formatNumber, initials, profileUrlFor } from '@/lib/format';
import type { PitchCreatorRow } from '@/types/api';
import { usePitchDetail } from '@/features/search/queries';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function PitchDetailPage() {
  const { pitchId } = useParams<{ pitchId: string }>();
  const { data, isPending, isError, error, refetch } = usePitchDetail(pitchId);

  useDocumentTitle(data?.pitch_code)

  if (isPending) return <LoadingState label="Loading pitch…" />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 h-7 px-2 text-xs">
            <Link to="/search/pitches">
              <ArrowLeft className="size-3" />
              Back to pitches
            </Link>
          </Button>
          <h1 className="truncate text-xl font-semibold">{data.campaign_name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs">{data.pitch_code}</span>
            <BrandLink brand={data.brand} emphasis="medium" />
            <OrgTypeBadge orgType={data.org_type} />
            {data.converted ? (
              <Badge variant="success">Converted</Badge>
            ) : (
              <Badge variant="outline">Never ran</Badge>
            )}
          </p>
        </div>
        {data.spreadsheet_link && (
          <Button asChild variant="outline" size="sm">
            <a href={data.spreadsheet_link} target="_blank" rel="noreferrer noopener">
              Pitch sheet
            </a>
          </Button>
        )}
      </div>

      <StatRow>
        <StatTile label="Creators listed" value={formatNumber(data.totals.creator_count)} />
        <StatTile
          label="Creator cost"
          value={formatCurrency(data.totals.total_final_cost)}
          hint="Sum of final costs"
        />
        <StatTile
          label="Brand cost"
          value={formatCurrency(data.totals.total_brand_cost)}
          hint="Quoted to the brand"
        />
        <StatTile
          label="Margin"
          value={
            data.totals.total_brand_cost && data.totals.total_final_cost
              ? `${(
                ((data.totals.total_brand_cost - data.totals.total_final_cost) /
                  data.totals.total_brand_cost) *
                100
              ).toFixed(1)}%`
              : '—'
          }
        />
      </StatRow>

      <Card>
        <CardContent className="pt-4">
          <DefinitionList>
            <DefinitionItem label="Requirement">
              <RequirementBadge requirement={data.requirement} />
            </DefinitionItem>
            <DefinitionItem label="Platform">
              <PlatformBadges platforms={data.platform} />
            </DefinitionItem>
            <DefinitionItem label="Sales lead">{data.sales_lead}</DefinitionItem>
            <DefinitionItem label="List lead">{data.list_lead ?? '—'}</DefinitionItem>
            <DefinitionItem label="Brand">
              <BrandLink brand={data.brand} />
            </DefinitionItem>
            <DefinitionItem label="Billing company">
              {data.company ? (
                <span>
                  {data.company.name}
                  {data.company.gstin && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {data.company.gstin}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground italic">not linked</span>
              )}
            </DefinitionItem>
            <DefinitionItem label="Resulting campaign">
              {data.campaign ? (
                <Link
                  to={`/campaigns/${data.campaign.id}`}
                  className="font-mono text-xs text-primary hover:underline"
                >
                  {data.campaign.campaign_code}
                </Link>
              ) : (
                <span className="text-muted-foreground">this pitch never became a campaign</span>
              )}
            </DefinitionItem>
            <DefinitionItem label="Created">{formatDateTime(data.created_at)}</DefinitionItem>
            <DefinitionItem label="Updated">{formatDateTime(data.updated_at)}</DefinitionItem>
          </DefinitionList>
        </CardContent>
      </Card>

      <section>
        <SectionTitle count={data.creators.length}>Creators in this pitch</SectionTitle>
        {/* PitchCreatorLink splits deliverables by platform, so the tabs follow suit. */}
        <Tabs defaultValue="deliverables">
          <TabsList className="mb-2.5">
            <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
            <TabsTrigger value="costs">Costs</TabsTrigger>
            <TabsTrigger value="rights">Rights</TabsTrigger>
          </TabsList>
          <TabsContent value="deliverables">
            <PitchCreatorTable columns={deliverableColumns} rows={data.creators} />
          </TabsContent>
          <TabsContent value="costs">
            <PitchCreatorTable columns={costColumns} rows={data.creators} />
          </TabsContent>
          <TabsContent value="rights">
            <PitchCreatorTable columns={rightsColumns} rows={data.creators} />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function PitchCreatorTable({
  columns,
  rows,
}: {
  columns: Column<PitchCreatorRow>[];
  rows: PitchCreatorRow[];
}) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.creator_id}
      maxHeightClass="max-h-[32rem]"
      emptyState={
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">
          No creators listed against this pitch yet.
        </p>
      }
    />
  );
}

const identityColumns: Column<PitchCreatorRow>[] = [
  {
    id: 'creator',
    header: 'Creator',
    cell: (row) => {
      const profileUrl = profileUrlFor(row);

      return (
        <span className="flex items-center gap-2.25">
          <Link
            to={`/creators/${row.creator_id}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-full border border-rp-border bg-rp-surface2 text-[10.5px] font-bold"
          >
            {initials(row.name)}
          </Link>

          <span className="min-w-0">
            <Link
              to={`/creators/${row.creator_id}`}
              className="block truncate font-semibold text-rp-text hover:underline"
            >
              {row.name}
            </Link>

            {row.username &&
              (profileUrl ? (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block truncate text-[11px] text-rp-muted hover:underline"
                >
                  @{row.username}
                </a>
              ) : (
                <span className="block truncate text-[11px] text-rp-muted">
                  @{row.username}
                </span>
              ))}
          </span>
        </span>
      );
    },
    className: 'max-w-52',
  },
];

/** Zero counts are noise in a wide grid, so render them as a dash. */
function count(value: number) {
  return value ? formatNumber(value) : <span className="text-muted-foreground">–</span>;
}

function money(value: number) {
  return value ? formatCurrency(value) : <span className="text-muted-foreground">–</span>;
}

const deliverableColumns: Column<PitchCreatorRow>[] = [
  ...identityColumns,
  {
    id: 'platform',
    header: 'Platform',
    cell: (row) => (
      <span title={PLATFORM_LABELS[row.platform] ?? row.platform}>
        <PlatformMark platform={row.platform} size={15} />
      </span>
    ),
  }, { id: 'tier', header: 'Tier', cell: (row) => <TierBadge tier={row.tier} /> },
  { id: 'followers', header: 'Followers', numeric: true, cell: (row) => formatNumber(row.followers) },
  { id: 'reels', header: 'Reels', numeric: true, cell: (row) => count(row.reel_count) },
  { id: 'reel_stories', header: 'Reel stories', numeric: true, cell: (row) => count(row.reel_story_count) },
  { id: 'video_stories', header: 'Video stories', numeric: true, cell: (row) => count(row.video_story_count) },
  { id: 'carousels', header: 'Static / carousel', numeric: true, cell: (row) => count(row.static_carousel_count) },
  { id: 'shorts', header: 'YT shorts', numeric: true, cell: (row) => count(row.short_form_videos_count) },
  { id: 'dedicated', header: 'Dedicated', numeric: true, cell: (row) => count(row.dedicated_video_count) },
  { id: 'integrated', header: 'Integrated', numeric: true, cell: (row) => count(row.integrated_video_count) },
  {
    id: 'store',
    header: 'Store visit',
    cell: (row) => (row.event_store_visit ? <Badge variant="primary">Yes</Badge> : '–'),
  },
];

const costColumns: Column<PitchCreatorRow>[] = [
  ...identityColumns,
  { id: 'reel_cost', header: 'Reel', numeric: true, cell: (row) => money(row.reel_cost) },
  { id: 'reel_story_cost', header: 'Reel story', numeric: true, cell: (row) => money(row.reel_story_cost) },
  { id: 'video_story_cost', header: 'Video story', numeric: true, cell: (row) => money(row.video_story_cost) },
  { id: 'carousel_cost', header: 'Static', numeric: true, cell: (row) => money(row.static_carousel_cost) },
  { id: 'shorts_cost', header: 'Shorts', numeric: true, cell: (row) => money(row.short_form_videos_cost) },
  { id: 'dedicated_cost', header: 'Dedicated', numeric: true, cell: (row) => money(row.dedicated_video_cost) },
  { id: 'integrated_cost', header: 'Integrated', numeric: true, cell: (row) => money(row.integrated_video_cost) },
  { id: 'rights_cost', header: 'Rights', numeric: true, cell: (row) => money(row.rights_cost) },
  { id: 'boosting_cost', header: 'Boosting', numeric: true, cell: (row) => money(row.boosting_cost) },
  { id: 'package', header: 'Package', numeric: true, cell: (row) => money(row.package_cost) },
  {
    id: 'final',
    header: 'Final',
    numeric: true,
    cell: (row) => <span className="font-medium">{formatCurrency(row.final_cost)}</span>,
  },
  { id: 'brand', header: 'Brand', numeric: true, cell: (row) => formatCurrency(row.brand_cost) },
];

const rightsColumns: Column<PitchCreatorRow>[] = [
  ...identityColumns,
  {
    id: 'usage',
    header: 'Usage rights',
    cell: (row) => row.usage_rights?.trim() || '—',
    
  },
  {
    id: 'ad_promo',
    header: 'Ad / promo rights',
    cell: (row) => row.ad_promo_rights?.trim() || '—',
  },
  {
    id: 'boosting',
    header: 'Boosting',
    cell: (row) => row.boosting?.trim() || '—',
  },
  {
    id: 'terms',
    header: 'Payment terms',
    cell: (row) => row.payment_terms?.trim() || '—',
  },
];