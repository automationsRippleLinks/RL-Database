import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/DataTable';
import { ErrorState, LoadingState } from '@/components/states';
import { MaskedContact } from '@/components/MaskedContact';
import { StatRow, StatTile } from '@/components/StatTile';
import {
  BrandLink,
  ChipList,
  DefinitionItem,
  DefinitionList,
  PlatformBadge,
  PlatformBadges,
  SectionTitle,
  StatusBadge,
  TierBadge,
} from '@/components/bits';
import {
  engagementRatio,
  formatCurrency,
  formatDate,
  formatNumber,
  humaniseCount,
  profileUrlFor,
} from '@/lib/format';
import { MONTH_LABELS } from '@/lib/enums';
import type { CreatorCampaignSummary, CreatorPitchSummary } from '@/types/api';
import { useBackTo } from '@/hooks/useBackTo';
import { withBackState } from '@/lib/navigation';
import { useCreatorDetail } from '../queries';
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export function CreatorDetailPage() {
  const { creatorId } = useParams<{ creatorId: string }>();
  const goBack = useBackTo('/search/creators');
  const { data, isPending, isError, error, refetch } = useCreatorDetail(creatorId);
  useDocumentTitle(data?.name);

  if (isPending) return <LoadingState label="Loading creator…" />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  const emails = [data.email, ...(data.additional_emails ?? [])].filter(Boolean) as string[];
  const phones = [data.phone, ...(data.additional_phones ?? [])].filter(Boolean) as string[];
  const profileUrl = profileUrlFor(data);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 mb-1 h-7 px-2 text-xs" onClick={goBack}>
            <ArrowLeft className="size-3" />
            Back
          </Button>
          <h1 className="truncate text-xl font-semibold">{data.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>@{data.username}</span>
            <PlatformBadge platform={data.platform} />
            <TierBadge tier={data.tier} />
          </p>
        </div>
        {profileUrl && (
          <Button asChild variant="outline" size="sm">
            <a href={profileUrl} target="_blank" rel="noreferrer noopener">
              Open profile
            </a>
          </Button>
        )}
      </div>

      <StatRow>
        <StatTile label="Followers" value={humaniseCount(data.followers)} hint={formatNumber(data.followers)} />
        <StatTile label="Avg views" value={humaniseCount(data.avg_views)} hint={formatNumber(data.avg_views)} />
        <StatTile
          label="Views / follower"
          value={engagementRatio(data.avg_views, data.followers)}
          hint="Avg views ÷ followers"
        />
        <StatTile label="Campaigns" value={formatNumber(data.campaigns.length)} hint={`${data.pitches.length} pitches`} />
      </StatRow>

      <Card>
        <CardContent className="pt-4">
          <DefinitionList>
            <DefinitionItem label="City">{data.city ?? '—'}</DefinitionItem>
            <DefinitionItem label="Gender">{data.gender ?? '—'}</DefinitionItem>
            <DefinitionItem label="Categories">
              <ChipList items={data.categories.length ? data.categories : []} max={12} />
            </DefinitionItem>
            <DefinitionItem label="Languages">
              <ChipList items={data.languages.length ? data.languages : []} max={12} />
            </DefinitionItem>
            <DefinitionItem label="Email">
              {emails.length ? (
                <div className="flex flex-col gap-1">
                  {emails.map((email) => (
                    <MaskedContact key={email} value={email} kind="email" />
                  ))}
                </div>
              ) : (
                '—'
              )}
            </DefinitionItem>
            <DefinitionItem label="Phone">
              {phones.length ? (
                <div className="flex flex-col gap-1">
                  {phones.map((phone) => (
                    <MaskedContact key={phone} value={phone} kind="phone" />
                  ))}
                </div>
              ) : (
                '—'
              )}
            </DefinitionItem>
          </DefinitionList>
        </CardContent>
      </Card>

      <section>
        <SectionTitle count={data.campaigns.length}>Campaigns</SectionTitle>
        <DataTable
          columns={campaignSummaryColumns}
          rows={data.campaigns}
          rowKey={(row) => row.campaign_id}
          maxHeightClass="max-h-96"
          emptyState={
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              Not attached to any campaign yet.
            </p>
          }
        />
      </section>

      <section>
        <SectionTitle count={data.pitches.length}>Pitches</SectionTitle>
        <DataTable
          columns={pitchSummaryColumns}
          rows={data.pitches}
          rowKey={(row) => row.pitch_id}
          maxHeightClass="max-h-96"
          emptyState={
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              Not included in any pitch yet.
            </p>
          }
        />
      </section>
    </div>
  );
}

const campaignSummaryColumns: Column<CreatorCampaignSummary>[] = [
  {
    id: 'code',
    header: 'Code',
    cell: (row) => (
      <Link
        to={`/campaigns/${row.campaign_id}`}
        state={withBackState(window.location).state}
        className="font-mono text-xs text-primary hover:underline"
      >
        {row.campaign_code}
      </Link>
    ),
  },
  { id: 'name', header: 'Campaign', cell: (row) => row.campaign_name, className: 'max-w-64 truncate' },
  { id: 'brand', header: 'Brand', cell: (row) => <BrandLink brand={row.brand} /> },
  {
    id: 'period',
    header: 'Period',
    cell: (row) => `${MONTH_LABELS[row.month_name] ?? row.month_name} ${row.year}`,
  },
  { id: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
  { id: 'live', header: 'Live date', cell: (row) => formatDate(row.live_date) },
  { id: 'views', header: 'Views', numeric: true, cell: (row) => formatNumber(row.views) },
  { id: 'cost', header: 'Final cost', numeric: true, cell: (row) => formatCurrency(row.final_cost) },
  { id: 'cpv', header: 'CPV', numeric: true, cell: (row) => (row.cpv ? `₹${row.cpv}` : '—') },
];

const pitchSummaryColumns: Column<CreatorPitchSummary>[] = [
  {
    id: 'code',
    header: 'Code',
    cell: (row) => (
      <Link
        to={`/pitches/${row.pitch_id}`}
        state={withBackState(window.location).state}
        className="font-mono text-xs text-primary hover:underline"
      >
        {row.pitch_code}
      </Link>
    ),
  },
  { id: 'brand', header: 'Brand', cell: (row) => <BrandLink brand={row.brand} /> },
  { id: 'campaign', header: 'Campaign', cell: (row) => row.campaign_name, className: 'max-w-64 truncate' },
  { id: 'platform', header: 'Platform', cell: (row) => <PlatformBadges platforms={row.platform} /> },
  { id: 'final', header: 'Final cost', numeric: true, cell: (row) => formatCurrency(row.final_cost) },
  { id: 'brand_cost', header: 'Brand cost', numeric: true, cell: (row) => formatCurrency(row.brand_cost) },
];