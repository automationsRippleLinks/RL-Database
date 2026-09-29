import { useMemo } from 'react';
import { useUrlSearchState } from '@/hooks/useUrlSearchState';
import { CAMPAIGN_STATUS_LABELS, MONTH_LABELS, MONTHS } from '@/lib/enums';
import type { CampaignFacets, CampaignStatus, Month } from '@/types/api';
import type { DropdownOption } from '../../components/FilterDropdown';

export type FilterGroupKey = 'status' | 'period' | 'manager' | 'brand';

/** One removable pill above the results, and the state it removes. */
export interface FilterPill {
  key: string;
  label: string;
  remove: () => void;
}

/**
 * The campaign rail's whole filter model — same shape as
 * useCreatorFilterModel/useBrandFilterModel, built from CampaignFacets and
 * the URL keys useCampaignRequest already reads (status, report_status,
 * month, year, manager, brand_id, start_from, start_to — see
 * SCOPE_FILTER_KEYS.campaigns in request-state.ts).
 */
export function useCampaignFilterModel(facets: CampaignFacets | undefined) {
  const url = useUrlSearchState();

  const statuses = url.getList('status');
  const reportStatuses = url.getList('report_status');
  const months = url.getList('month');
  const years = url.getList('year');
  const managers = url.getList('manager');
  const brandIds = url.getList('brand_id');
  const startFrom = url.getString('start_from');
  const startTo = url.getString('start_to');

  const set = (updates: Parameters<typeof url.setParams>[0]) =>
    url.setParams(updates, { replace: true, resetPage: true });

  const options = useMemo(() => {
    const asOptions = (values: readonly string[]): DropdownOption[] =>
      values.map((value) => ({ value, label: value }));

    return {
      status: (facets?.statuses ?? []).map((status) => ({
        value: status,
        label: CAMPAIGN_STATUS_LABELS[status] ?? status,
      })),
      reportStatus: (facets?.report_statuses ?? []).map((status) => ({
        value: status,
        label: CAMPAIGN_STATUS_LABELS[status] ?? status,
      })),
      // MONTHS (not facets.months) so the list is always Jan–Dec in order,
      // rather than however many distinct months the data happens to have.
      month: MONTHS.map((month) => ({ value: month, label: MONTH_LABELS[month] })),
      year: asOptions((facets?.years ?? []).map(String).sort((a, b) => Number(b) - Number(a))),
      manager: asOptions([...(facets?.managers ?? [])].sort((a, b) => a.localeCompare(b))),
      brand: (facets?.brands ?? [])
        .map((brand) => ({ value: String(brand.id), label: brand.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [facets]);

  const counts: Record<FilterGroupKey, number> = {
    status: statuses.length + reportStatuses.length,
    period: months.length + years.length,
    manager: managers.length,
    brand: brandIds.length,
    // dates: startFrom || startTo ? 1 : 0,
  };

  const totalApplied = Object.values(counts).reduce((sum, count) => sum + count, 0);

  const values = {
    statuses,
    reportStatuses,
    months,
    years,
    managers,
    brandIds,
    startFrom,
    startTo,
  };

  const actions = {
    setStatuses: (next: string[]) => set({ status: next }),
    setReportStatuses: (next: string[]) => set({ report_status: next }),
    setMonths: (next: string[]) => set({ month: next }),
    setYears: (next: string[]) => set({ year: next }),
    setManagers: (next: string[]) => set({ manager: next }),
    setBrands: (next: string[]) => set({ brand_id: next }),
    setDates: (from: string, to: string) => set({ start_from: from || null, start_to: to || null }),
    clearAll: (clearQuery: boolean = false) =>
      set({
        status: null,
        report_status: null,
        month: null,
        year: null,
        manager: null,
        brand_id: null,
        start_from: null,
        start_to: null,
        ...(clearQuery && { q: null }),
      }),
  };

  const pills: FilterPill[] = useMemo(() => {
    const list: FilterPill[] = [];
    const drop = (values: string[], value: string) => values.filter((item) => item !== value);

    for (const value of statuses) {
      list.push({
        key: `status:${value}`,
        label: CAMPAIGN_STATUS_LABELS[value as CampaignStatus] ?? value,
        remove: () => set({ status: drop(statuses, value) }),
      });
    }
    for (const value of reportStatuses) {
      list.push({
        key: `report:${value}`,
        label: `Report: ${CAMPAIGN_STATUS_LABELS[value as CampaignStatus] ?? value}`,
        remove: () => set({ report_status: drop(reportStatuses, value) }),
      });
    }
    for (const value of months) {
      list.push({
        key: `month:${value}`,
        label: MONTH_LABELS[value as Month] ?? value,
        remove: () => set({ month: drop(months, value) }),
      });
    }
    for (const value of years) {
      list.push({
        key: `year:${value}`,
        label: value,
        remove: () => set({ year: drop(years, value) }),
      });
    }
    for (const value of managers) {
      list.push({
        key: `manager:${value}`,
        label: value,
        remove: () => set({ manager: drop(managers, value) }),
      });
    }
    for (const value of brandIds) {
      const name = facets?.brands?.find((brand) => String(brand.id) === value)?.name ?? `Brand ${value}`;
      list.push({
        key: `brand:${value}`,
        label: name,
        remove: () => set({ brand_id: drop(brandIds, value) }),
      });
    }
    if (startFrom || startTo) {
      list.push({
        key: 'dates',
        label: `Starts ${startFrom || 'any'} – ${startTo || 'any'}`,
        remove: () => set({ start_from: null, start_to: null }),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facets, statuses, reportStatuses, months, years, managers, brandIds, startFrom, startTo, url]);

  return { options, counts, totalApplied, values, actions, pills };
}
