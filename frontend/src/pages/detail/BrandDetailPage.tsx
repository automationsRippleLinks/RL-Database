import { useLocation, useNavigate, useParams } from 'react-router-dom';
// import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/UI/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/DataTable';
import { ErrorState, LoadingState } from '@/components/states';
import { StatRow, StatTile } from '@/components/StatTile';
import {
  DefinitionItem,
  DefinitionList,
  OrgTypeBadge,
  PlatformBadges,
  SectionTitle,
} from '@/components/bits';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { useBackTo } from '@/hooks/useBackTo';
import { withBackState } from '@/lib/navigation';
import { campaignColumns } from '@/features/search/campaigns/columns';
import { pitchColumns } from '@/features/search/pitches/columns';
import { creatorColumns } from '@/features/search/creators/columns';
import { useBrandDetail } from '@/features/search/queries';
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export function BrandDetailPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useBackTo('/search/brands');

  // An id-keyed route needs no encode/decode dance, unlike the old name-keyed one.
  const id = brandId ? Number(brandId) : undefined;
  const { data, isPending, isError, error, refetch } = useBrandDetail(
    Number.isFinite(id) ? id : undefined,
  );
  useDocumentTitle(data?.name);

  if (isPending) return <LoadingState label="Loading brand…" />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <div className="space-y-5">

      <div className="min-w-0">
       
        <Button variant="ghost" size="sm" className="-ml-2 mb-1 h-7 px-2 text-xs" onClick={goBack}>
          <ArrowLeft className="size-3" />
          Back
        </Button>

        <h1 className="truncate text-xl font-semibold">{data.name}</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {data.company?.name ?? 'No billing company linked'}
          {data.org_types.map((orgType) => (
            <OrgTypeBadge key={orgType} orgType={orgType} />
          ))}
        </p>
      </div>

      <StatRow>
        <StatTile label="Campaigns" value={formatNumber(data.campaign_count)} />
        <StatTile label="Pitches" value={formatNumber(data.pitch_count)} />
        <StatTile label="Creators engaged" value={formatNumber(data.creator_count)} />
        <StatTile
          label="Total brand cost"
          value={formatCurrency(data.total_brand_cost)}
          hint="Across all campaigns"
        />
      </StatRow>

      <Card>
        <CardContent className="pt-4">
          <DefinitionList>
            <DefinitionItem label="Billing company">
              {data.company?.name ?? <span className="text-muted-foreground italic">not linked</span>}
            </DefinitionItem>
            <DefinitionItem label="Brand GSTIN">
              {data.gstin ? (
                <span className="font-mono text-xs">{data.gstin}</span>
              ) : (
                <span className="text-muted-foreground">not on file</span>
              )}
            </DefinitionItem>
            {/* The owning company carries its own GSTIN, separate from the brand's. */}
            <DefinitionItem label="Company GSTIN">
              {data.company?.gstin ? (
                <span className="font-mono text-xs">{data.company.gstin}</span>
              ) : (
                <span className="text-muted-foreground">not on file</span>
              )}
            </DefinitionItem>
            <DefinitionItem label="Platforms">
              <PlatformBadges platforms={data.platforms} />
            </DefinitionItem>
            <DefinitionItem label="Last activity">{formatDate(data.latest_activity)}</DefinitionItem>
          </DefinitionList>
        </CardContent>
      </Card>

      <section>
        <SectionTitle count={data.campaigns.length}>Campaigns</SectionTitle>
        <DataTable
          columns={campaignColumns}
          rows={data.campaigns}
          rowKey={(row) => row.id}
          // onRowClick={(row) => navigate(`/campaigns/${row.id}`)}
          onRowClick={(row) => navigate(`/campaigns/${row.id}`, withBackState(location))}

          maxHeightClass="max-h-96"
          emptyState={
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              No campaigns for this brand yet.
            </p>
          }
        />
      </section>

      <section>
        <SectionTitle count={data.pitches.length}>Pitches</SectionTitle>
        <DataTable
          columns={pitchColumns}
          rows={data.pitches}
          rowKey={(row) => row.id}
          // onRowClick={(row) => navigate(`/pitches/${row.id}`)}
          
          onRowClick={(row) => navigate(`/pitches/${row.id}`, withBackState(location))}


          maxHeightClass="max-h-96"
          emptyState={
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              No pitches for this brand yet.
            </p>
          }
        />
      </section>

      {data.top_creators.length > 0 && (
        <section>
          <SectionTitle count={data.top_creators.length}>Most-used creators</SectionTitle>
          <DataTable
            columns={creatorColumns}
            rows={data.top_creators}
            rowKey={(row) => row.id}
            // onRowClick={(row) => navigate(`/creators/${row.id}`)}
            onRowClick={(row) => navigate(`/creators/${row.id}`, withBackState(location))}

            maxHeightClass="max-h-96"
          />
        </section>
      )}
    </div>
  );
}
