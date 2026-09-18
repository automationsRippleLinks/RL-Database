import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { DataTable } from '@/components/DataTable';
import { FacetMultiSelect } from '@/components/FacetMultiSelect';
import { Pagination } from '@/components/Pagination';
import { RangeFilter } from '@/components/RangeFilter';
import { EmptyState, ErrorState } from '@/components/states';
import { useUrlSearchState } from '@/hooks/useUrlSearchState';
import { ORG_TYPE_LABELS, PLATFORM_LABELS } from '@/lib/enums';
import { formatNumber } from '@/lib/format';
import {
  FilterCheckbox,
  FilterPanel,
  toOptions,
} from "@/features/search//FilterPanel";
import { ResultsHeader } from '@/features/search//ResultsHeader';
import { BRAND_SORTS, SCOPE_FILTER_KEYS, countActiveFilters, useBrandRequest } from '@/features/search//request-state';
import { useBrandFacets, useBrandSearch } from '@/features/search//queries';
import { brandColumns } from "@/features/search/brands/columns";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export function BrandSearchPage() {
  useDocumentTitle("Search");
  
  const url = useUrlSearchState();
  const navigate = useNavigate();
  const request = useBrandRequest();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const facetsQuery = useBrandFacets();
  const searchQuery = useBrandSearch(request);
  const result = searchQuery.data;
  const activeFilterCount = countActiveFilters(request);

  const set = (updates: Parameters<typeof url.setParams>[0]) =>
    url.setParams(updates, { replace: true, resetPage: true });

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <FilterPanel
        open={filtersOpen}
        footer={
          facetsQuery.data && (
            <p className="text-[11px] text-muted-foreground tnum">
              {formatNumber(facetsQuery.data.total_brands)} brands across pitches and campaigns
            </p>
          )
        }
      >
        <FacetMultiSelect
          label="Org type"
          options={toOptions(facetsQuery.data?.org_types, ORG_TYPE_LABELS)}
          selected={request.org_types}
          onChange={(values) => set({ b_org: values })}
        />
        <FacetMultiSelect
          label="Platform"
          options={toOptions(facetsQuery.data?.platforms, PLATFORM_LABELS)}
          selected={request.platforms}
          onChange={(values) => set({ b_platform: values })}
        />
        <RangeFilter
          label="Min campaigns"
          min={request.min_campaigns}
          max={null}
          step={1}
          onChange={(min) => set({ min_campaigns: min })}
        />
        <RangeFilter
          label="Min pitches"
          min={request.min_pitches}
          max={null}
          step={1}
          onChange={(min) => set({ min_pitches: min })}
        />
        <div className="space-y-2">
          <FilterCheckbox
            id="has-company"
            label="Has a billing company"
            checked={request.has_company}
            onChange={(checked) => set({ has_company: checked })}
          />
          <FilterCheckbox
            id="has-gstin"
            label="Has GSTIN on file"
            checked={request.has_gstin}
            onChange={(checked) => set({ has_gstin: checked })}
          />
        </div>
      </FilterPanel>

      <div className="min-w-0 flex-1 space-y-3">
        <ResultsHeader
          total={result?.total}
          tookMs={result?.took_ms}
          isFetching={searchQuery.isFetching}
          entityLabel="brand"
          sort={request.sort}
          sortOptions={BRAND_SORTS}
          onSortChange={(sort) => set({ sort })}
          activeFilterCount={activeFilterCount}
          onResetFilters={() =>
            url.setParams(
              Object.fromEntries(SCOPE_FILTER_KEYS.brands.map((key) => [key, null])),
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
              columns={brandColumns}
              rows={result?.rows ?? []}
              rowKey={(row) => String(row.id)}
              onRowClick={(row) => navigate(`/brands/${row.id}`)}
              isLoading={searchQuery.isPending}
              isFetching={searchQuery.isFetching && !searchQuery.isPending}
              emptyState={
                <EmptyState
                  icon={<Building2 className="size-7" />}
                  title="No brands match"
                  description="Brand search covers the brand name, its GSTIN, and the name of the company that owns it."
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
