import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { DataTable } from '@/components/DataTable';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { FacetMultiSelect } from '@/components/FacetMultiSelect';
import { Pagination } from '@/components/Pagination';
import { EmptyState, ErrorState } from '@/components/states';
import { Select } from '@/components/UI/select';
import { useUrlSearchState } from '@/hooks/useUrlSearchState';
import { ORG_TYPE_LABELS, PITCH_REQUIREMENT_LABELS, PLATFORM_LABELS } from '@/lib/enums';
import { formatNumber } from '@/lib/format';
import { FilterPanel, brandOptions, toOptions } from '@/features/search/FilterPanel';
import { ResultsHeader } from "@/features/search/ResultsHeader";
import {
  PITCH_SORTS,
  SCOPE_FILTER_KEYS,
  countActiveFilters,
  usePitchRequest,
} from "@/features/search/request-state";
import { usePitchFacets, usePitchSearch } from "@/features/search/queries";
import { pitchColumns } from "@/features/search/pitches/columns";
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function PitchSearchPage() {
  useDocumentTitle('Search');

  const url = useUrlSearchState();
  const navigate = useNavigate();
  const request = usePitchRequest();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const facetsQuery = usePitchFacets();
  const searchQuery = usePitchSearch(request);
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
              {formatNumber(facets.total_pitches)} pitches in the database
            </p>
          )
        }
      >
        <FacetMultiSelect
          label="Brand"
          options={brandOptions(facets?.brands)}
          selected={request.brand_ids.map(String)}
          onChange={(values) => set({ p_brand_id: values })}
        />
        <FacetMultiSelect
          label="Org type"
          options={toOptions(facets?.org_types, ORG_TYPE_LABELS)}
          selected={request.org_types}
          onChange={(values) => set({ p_org: values })}
        />
        <FacetMultiSelect
          label="Requirement"
          options={toOptions(facets?.requirements, PITCH_REQUIREMENT_LABELS)}
          selected={request.requirements}
          onChange={(values) => set({ requirement: values })}
        />
        <FacetMultiSelect
          label="Platform"
          options={toOptions(facets?.platforms, PLATFORM_LABELS)}
          selected={request.platforms}
          onChange={(values) => set({ p_platform: values })}
        />
        <FacetMultiSelect
          label="Sales lead"
          options={toOptions(facets?.sales_leads)}
          selected={request.sales_leads}
          onChange={(values) => set({ sales_lead: values })}
        />
        <FacetMultiSelect
          label="List lead"
          options={toOptions(facets?.list_leads)}
          selected={request.list_leads}
          onChange={(values) => set({ list_lead: values })}
        />

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Became a campaign</span>
          <Select
            value={request.converted === null ? '' : request.converted ? '1' : '0'}
            onChange={(event) => set({ converted: event.target.value === '' ? null : event.target.value })}
            aria-label="Converted to a campaign"
          >
            <option value="">Any</option>
            <option value="1">Yes — converted</option>
            <option value="0">No — never ran</option>
          </Select>
        </div>

        <DateRangeFilter
          label="Created"
          from={request.created_from}
          to={request.created_to}
          onChange={(from, to) => set({ created_from: from, created_to: to })}
        />
      </FilterPanel>

      <div className="min-w-0 flex-1 space-y-3">
        <ResultsHeader
          total={result?.total}
          tookMs={result?.took_ms}
          isFetching={searchQuery.isFetching}
          entityLabel="pitch"
          sort={request.sort}
          sortOptions={PITCH_SORTS}
          onSortChange={(sort) => set({ sort })}
          activeFilterCount={activeFilterCount}
          onResetFilters={() =>
            url.setParams(
              Object.fromEntries(SCOPE_FILTER_KEYS.pitches.map((key) => [key, null])),
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
              columns={pitchColumns}
              rows={result?.rows ?? []}
              rowKey={(row) => row.id}
              onRowClick={(row) => navigate(`/pitches/${row.id}`)}
              isLoading={searchQuery.isPending}
              isFetching={searchQuery.isFetching && !searchQuery.isPending}
              emptyState={
                <EmptyState
                  icon={<FileText className="size-7" />}
                  title="No pitches match"
                  description="Text search covers the pitch code, brand, campaign name, and the sales and list leads."
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
