import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/DataTable';
import { ErrorState, LoadingState } from '@/components/states';
import { StatRow, StatTile } from '@/components/StatTile';
import { Badge } from '@/components/ui/badge';
import { PlatformMark } from '@/components/PlatformMark';
import { MONTH_LABELS, PLATFORM_LABELS } from '@/lib/enums'; import {
  BrandLink,
  ChipList,
  DefinitionItem,
  DefinitionList,
  ExternalLink,
  SectionTitle,
  StatusBadge,
  TierBadge,
} from '@/components/bits';
import {
  formatCurrency,
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  humaniseCount,
  initials,
  profileUrlFor
} from '@/lib/format';
import type { CampaignCreatorRow } from '@/types/api';
import { useCampaignDetail } from '@/features/search/queries';
import { useBackTo } from '@/hooks/useBackTo';
import { withBackState } from '@/lib/navigation';
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export function CampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const location = useLocation();
  const goBack = useBackTo('/search/campaigns');
  const { data, isPending, isError, error, refetch } = useCampaignDetail(campaignId);
  useDocumentTitle(data?.campaign_name);

  if (isPending) return <LoadingState label="Loading campaign…" />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  const { totals } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 mb-1 h-7 px-2 text-xs" onClick={goBack}>
            <ArrowLeft className="size-3" />
            Back
          </Button>
          <h1 className="truncate text-xl font-semibold">{data.campaign_name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs">{data.campaign_code}</span>
            <BrandLink brand={data.brand} />
            <StatusBadge status={data.status} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.spreadsheet_link && (
            <Button asChild variant="outline" size="sm">
              <a href={data.spreadsheet_link} target="_blank" rel="noreferrer noopener">
                Tracker sheet
              </a>
            </Button>
          )}
          {data.report_link && (
            <Button asChild variant="outline" size="sm">
              <a href={data.report_link} target="_blank" rel="noreferrer noopener">
                Report
              </a>
            </Button>
          )}
        </div>
      </div>

      <StatRow cols={5}>
        <StatTile
          label="Creators"
          value={formatNumber(totals.creator_count)}
          hint={totals.dropped_count ? `${totals.dropped_count} dropped` : 'none dropped'}
        />
        <StatTile label="Total views" value={humaniseCount(totals.total_views)} hint={formatNumber(totals.total_views)} />
        <StatTile label="Creator cost" value={formatCurrency(totals.total_final_cost)} hint="Sum of final costs" />
        <StatTile label="Brand cost" value={formatCurrency(totals.total_brand_cost)} hint="Billed to the brand" />
        <StatTile label="Avg CPV" value={totals.avg_cpv ? `₹${totals.avg_cpv}` : '—'} hint="Cost per view" />
      </StatRow>

      <Card>
        <CardContent className="pt-4">
          <DefinitionList>
            <DefinitionItem label="Period">
              {MONTH_LABELS[data.month_name] ?? data.month_name} {data.year}
            </DefinitionItem>
            <DefinitionItem label="Manager">{data.manager}</DefinitionItem>
            <DefinitionItem label="Team">
              <ChipList items={data.member_names} max={10} />
            </DefinitionItem>
            <DefinitionItem label="Report status">
              <StatusBadge status={data.report_status} />
            </DefinitionItem>
            <DefinitionItem label="Start date">{formatDate(data.start_date)}</DefinitionItem>
            <DefinitionItem label="Expected end">{formatDate(data.expected_end_date)}</DefinitionItem>
            <DefinitionItem label="Actual end">{formatDate(data.end_date)}</DefinitionItem>
            <DefinitionItem label="Report completed">{formatDate(data.report_completion_date)}</DefinitionItem>
            <DefinitionItem label="Originating pitch">
              {data.pitch ? (
                <Link
                  to={`/pitches/${data.pitch.id}`}
                  state={withBackState(location).state}
                  className="font-mono text-xs text-primary hover:underline"
                >
                  {data.pitch.pitch_code}
                </Link>
              ) : (
                <span className="text-muted-foreground">not linked to a pitch</span>
              )}
            </DefinitionItem>
          </DefinitionList>
        </CardContent>
      </Card>

      <section>
        <SectionTitle count={data.creators.length}>Creators on this campaign</SectionTitle>
        {/*
          CampaignCreatorLink carries roughly sixty columns. Showing them all at once
          is unreadable, so they're split into the three questions people actually
          ask: what was agreed, what it cost, and how it performed.
        */}
        <Tabs defaultValue="delivery">
          <TabsList className="mb-2.5">
            <TabsTrigger value="delivery">Delivery</TabsTrigger>
            <TabsTrigger value="commercials">Commercials</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="audience">Audience</TabsTrigger>
          </TabsList>

          <TabsContent value="delivery">
            <CreatorTable columns={deliveryColumns} rows={data.creators} />
          </TabsContent>
          <TabsContent value="commercials">
            <CreatorTable columns={commercialColumns} rows={data.creators} />
          </TabsContent>
          <TabsContent value="performance">
            <CreatorTable columns={performanceColumns} rows={data.creators} />
          </TabsContent>
          <TabsContent value="audience">
            <CreatorTable columns={audienceColumns} rows={data.creators} />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function CreatorTable({
  columns,
  rows,
}: {
  columns: Column<CampaignCreatorRow>[];
  rows: CampaignCreatorRow[];
}) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.creator_id}
      maxHeightClass="max-h-[32rem]"
      emptyState={
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">
          No creators attached to this campaign yet.
        </p>
      }
    />
  );
}

/** Shared leading columns so a creator stays identifiable across all four tabs. */
const creatorIdentityColumns: Column<CampaignCreatorRow>[] = [
  {
    id: 'creator',
    header: 'Creator',
    cell: (row) => {
      const profileUrl = profileUrlFor(row);

      return (
        <span className="flex items-center gap-2.25">
          <Link
            to={`/creators/${row.creator_id}`}
            state={withBackState(window.location).state}
            className="flex size-7 shrink-0 items-center justify-center rounded-full border border-rp-border bg-rp-surface2 text-[10.5px] font-bold"
          >
            {initials(row.name)}
          </Link>

          <span className="min-w-0">
            <Link
              to={`/creators/${row.creator_id}`}
              state={withBackState(window.location).state}
              className="block truncate font-semibold text-rp-text hover:underline"
            >
              {row.name}
            </Link>

            {row.username && (
              profileUrl ? (
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
              )
            )}
          </span>
        </span>
      );
    },
    className: 'max-w-52',
  },
];

const deliveryColumns: Column<CampaignCreatorRow>[] = [
  ...creatorIdentityColumns,
  {
    id: 'platform',
    header: 'Platform',
    cell: (row) => (
      <span title={PLATFORM_LABELS[row.platform] ?? row.platform}>
        <PlatformMark platform={row.platform} size={15} />
      </span>
    ),
  }, { id: 'tier', header: 'Tier', cell: (row) => <TierBadge tier={row.tier} /> },
  {
    id: 'deliverables',
    header: 'Deliverables',
    cell: (row) => row.deliverables_raw ?? '—',
    className: 'max-w-56 truncate',
  },
  {
    id: 'status',
    header: 'Content',
    cell: (row) =>
      row.is_dropped ? (
        <Badge variant="destructive">Dropped</Badge>
      ) : (
        <Badge variant="outline">{row.content_status ?? '—'}</Badge>
      ),
  },
  {
    id: 'product',
    header: 'Product',
    cell: (row) => row.product_status?.trim() || '—',
    className: 'text-center',
  },
  { id: 'shoot', header: 'Shoot', cell: (row) => formatDate(row.shoot_date) },
  { id: 'live', header: 'Live', cell: (row) => formatDate(row.live_date) },
  { id: 'poc', header: 'POC', cell: (row) => <ChipList items={row.poc_name} max={2} /> },
  {
    id: 'links',
    header: 'Links',
    cell: (row) => (
      <span className="flex items-center gap-2">
        <ExternalLink href={row.script_links}>script</ExternalLink>
        <ExternalLink href={row.live_links}>live</ExternalLink>
      </span>
    ),
  },
];

const commercialColumns: Column<CampaignCreatorRow>[] = [
  ...creatorIdentityColumns,
  { id: 'initial', header: 'Initial cost', numeric: true, cell: (row) => formatCurrency(row.initial_cost) },
  { id: 'final', header: 'Final cost', numeric: true, cell: (row) => formatCurrency(row.final_cost) },
  { id: 'brand', header: 'Brand cost', numeric: true, cell: (row) => formatCurrency(row.brand_cost) },
  { id: 'agency', header: 'Agency fee', numeric: true, cell: (row) => formatCurrency(row.agency_fee) },
  { id: 'terms', header: 'Payment terms', cell: (row) => row.payment_terms ?? '—' },
  {
    id: 'margin',
    header: 'Margin',
    numeric: true,
    cell: (row) => {
      if (!row.brand_cost || !row.final_cost) return '—';
      return formatPercent(((row.brand_cost - row.final_cost) / row.brand_cost) * 100);
    },
  },
  { id: 'cpv', header: 'CPV', numeric: true, cell: (row) => (row.cpv ? `₹${row.cpv}` : '—') },
];

const performanceColumns: Column<CampaignCreatorRow>[] = [
  ...creatorIdentityColumns,
  { id: 'expected', header: 'Expected views', numeric: true, cell: (row) => formatNumber(row.expected_views) },
  {
    id: 'views',
    header: 'Actual views',
    numeric: true,
    cell: (row) => formatNumber((row.ig_reel_views ?? 0) + (row.yt_views ?? 0) || null),
  },
  {
    id: 'delta',
    header: 'vs expected',
    numeric: true,
    cell: (row) => {
      const actual = (row.ig_reel_views ?? 0) + (row.yt_views ?? 0);
      if (!row.expected_views || !actual) return '—';
      const delta = ((actual - row.expected_views) / row.expected_views) * 100;
      return (
        <span className={delta >= 0 ? 'text-(--success)]' : 'text-destructive'}>
          {delta >= 0 ? '+' : ''}
          {delta.toFixed(0)}%
        </span>
      );
    },
  },
  {
    id: 'likes',
    header: 'Likes',
    numeric: true,
    cell: (row) => formatNumber((row.ig_reel_likes ?? 0) + (row.yt_likes ?? 0) || null),
  },
  {
    id: 'comments',
    header: 'Comments',
    numeric: true,
    cell: (row) => formatNumber((row.ig_reel_comments ?? 0) + (row.yt_comments ?? 0) || null),
  },
  { id: 'shares', header: 'Shares', numeric: true, cell: (row) => formatNumber(row.ig_reel_shares) },
  { id: 'saves', header: 'Saves', numeric: true, cell: (row) => formatNumber(row.ig_reel_saves) },
  { id: 'reach', header: 'Reel reach', numeric: true, cell: (row) => formatNumber(row.ig_reel_reach) },
  { id: 'story', header: 'Story views', numeric: true, cell: (row) => formatNumber(row.ig_story_views) },
  {
    id: 'er',
    header: 'ER',
    numeric: true,
    cell: (row) => formatPercent(usesIgColumns(row) ? row.ig_reels_er_perc : row.yt_er_perc, 0),
  },
  {
    id: 'watch',
    header: 'Avg watch',
    numeric: true,
    cell: (row) => (usesIgColumns(row) ? formatDuration(row.ig_avg_watch_time) : '—'),
  },
  {
    id: 'total_watch',
    header: 'Total watch',
    numeric: true,
    cell: (row) =>
      formatDuration(usesIgColumns(row) ? row.ig_total_watch_time : row.yt_total_watch_time),
  },
];

function usesIgColumns(row: CampaignCreatorRow): boolean {
  return row.platform === 'instagram';
}

const audienceColumns: Column<CampaignCreatorRow>[] = [
  ...creatorIdentityColumns,
  { id: 'followers', header: 'Followers', numeric: true, cell: (row) => formatNumber(row.followers) },
  { id: 'male', header: 'Male', numeric: true, cell: (row) => formatPercent(row.ig_male_perc, 0) },
  { id: 'female', header: 'Female', numeric: true, cell: (row) => formatPercent(row.ig_female_perc, 0) },
  { id: 'ir', header: 'Impression rate', numeric: true, cell: (row) => formatPercent(row.ig_reels_ir_perc, 0) },
  {
    id: 'impressions',
    header: 'YT impressions',
    numeric: true,
    cell: (row) => formatNumber(row.yt_total_impressions),
  },
];
