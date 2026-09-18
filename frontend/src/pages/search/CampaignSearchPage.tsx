import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { DataTable } from '@/components/DataTable';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { FacetMultiSelect } from '@/components/FacetMultiSelect';
import { Pagination } from '@/components/Pagination';
import { EmptyState, ErrorState } from '@/components/states';
import { useUrlSearchState } from '@/hooks/useUrlSearchState';
import { CAMPAIGN_STATUS_LABELS, MONTH_LABELS } from '@/lib/enums';
import { formatNumber } from '@/lib/format';
import {
  FilterPanel,
  brandOptions,
  toOptions,
} from "@/features/search/FilterPanel";
import { ResultsHeader } from "@/features/search/ResultsHeader";
import {
  CAMPAIGN_SORTS,
  SCOPE_FILTER_KEYS,
  countActiveFilters,
  useCampaignRequest,
} from "@/features/search/request-state";
import {
  useCampaignFacets,
  useCampaignSearch,
} from "@/features/search/queries";
import { campaignColumns } from "@/features/search/campaigns/columns";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export function CampaignSearchPage() {
  useDocumentTitle("Search");
  
  const url = useUrlSearchState();
  const navigate = useNavigate();
  const request = useCampaignRequest();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const facetsQuery = useCampaignFacets();
  const searchQuery = useCampaignSearch(request);
  const result = searchQuery.data;
  const facets = facetsQuery.data;
  const activeFilterCount = countActiveFilters(request);

  const set = (updates: Parameters<typeof url.setParams>[0]) =>
    url.setParams(updates, { replace: true, resetPage: true });

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <FilterPanel
        open={filtersOpen}
        footer={
          facets && (
            <p className="text-[11px] text-muted-foreground tnum">
              {formatNumber(facets.total_campaigns)} campaigns in the database
            </p>
          )
        }
      >
        <FacetMultiSelect
          label="Status"
          options={toOptions(facets?.statuses, CAMPAIGN_STATUS_LABELS)}
          selected={request.statuses}
          onChange={(values) => set({ status: values })}
        />
        <FacetMultiSelect
          label="Report status"
          options={toOptions(facets?.report_statuses, CAMPAIGN_STATUS_LABELS)}
          selected={request.report_statuses}
          onChange={(values) => set({ report_status: values })}
        />
        <FacetMultiSelect
          label="Brand"
          options={brandOptions(facets?.brands)}
          selected={request.brand_ids.map(String)}
          onChange={(values) => set({ brand_id: values })}
        />
        <FacetMultiSelect
          label="Manager"
          options={toOptions(facets?.managers)}
          selected={request.managers}
          onChange={(values) => set({ manager: values })}
        />
        <FacetMultiSelect
          label="Month"
          options={toOptions(facets?.months, MONTH_LABELS)}
          selected={request.months}
          onChange={(values) => set({ month: values })}
        />
        <FacetMultiSelect
          label="Year"
          options={toOptions(facets?.years)}
          selected={request.years.map(String)}
          onChange={(values) => set({ year: values })}
        />
        <DateRangeFilter
          label="Start date"
          from={request.start_date_from}
          to={request.start_date_to}
          onChange={(from, to) => set({ start_from: from, start_to: to })}
        />
      </FilterPanel>

      <div className="min-w-0 flex-1 space-y-3">
        <ResultsHeader
          total={result?.total}
          tookMs={result?.took_ms}
          isFetching={searchQuery.isFetching}
          entityLabel="campaign"
          sort={request.sort}
          sortOptions={CAMPAIGN_SORTS}
          onSortChange={(sort) => set({ sort })}
          activeFilterCount={activeFilterCount}
          onResetFilters={() =>
            url.setParams(
              Object.fromEntries(SCOPE_FILTER_KEYS.campaigns.map((key) => [key, null])),
              { replace: false, resetPage: true },
            )
          }
          onToggleFilters={() => setFiltersOpen((open) => !open)}
        />

        {searchQuery.isError ? (
          <ErrorState error={searchQuery.error} onRetry={() => searchQuery.refetch()} />
        ) : (
          <>
            <DataTable
              columns={campaignColumns}
              rows={result?.rows ?? []}
              rowKey={(row) => row.id}
              onRowClick={(row) => navigate(`/campaigns/${row.id}`)}
              isLoading={searchQuery.isPending}
              isFetching={searchQuery.isFetching && !searchQuery.isPending}
              emptyState={
                <EmptyState
                  icon={<Megaphone className="size-7" />}
                  title="No campaigns match"
                  description="Text search covers the campaign code, name, brand, manager and team members."
                />
              }
            />
            <Pagination
              page={result?.page ?? 1}
              pages={result?.pages ?? 1}
              pageSize={request.page_size}
              total={result?.total ?? 0}
              disabled={searchQuery.isFetching}
              onPageChange={(page) => url.setParams({ page }, { replace: false })}
              onPageSizeChange={(size) => set({ size })}
            />
          </>
        )}
      </div>
    </div>
  );
}
