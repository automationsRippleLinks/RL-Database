import { useMemo } from 'react';
import { useUrlSearchState } from '@/hooks/useUrlSearchState';
import { ORG_TYPE_LABELS, PITCH_REQUIREMENT_LABELS, PLATFORM_LABELS } from '@/lib/enums';
import type { OrgType, PitchFacets, PitchRequirement, Platform } from '@/types/api';
import type { DropdownOption } from '../../components/FilterDropdown';

export type FilterGroupKey = 'platform' | 'type' | 'brand' | 'team' | 'converted' | 'dates';

/** One removable pill above the results, and the state it removes. */
export interface FilterPill {
  key: string;
  label: string;
  remove: () => void;
}

/**
 * The pitch rail's whole filter model — same shape as the other three scopes.
 * Built from PitchFacets and the URL keys usePitchRequest already reads
 * (p_org, requirement, p_platform, sales_lead, list_lead, p_brand_id,
 * created_from, created_to, converted — see SCOPE_FILTER_KEYS.pitches).
 *
 * `p_` prefixes on platform/org/brand are deliberate — Creators and
 * Campaigns/Brands each own their own `platform`/`brand_id`-shaped keys, and
 * a pitch filter must not collide with those when someone switches tabs
 * (see request-state.ts's own note on this).
 */
export function usePitchFilterModel(facets: PitchFacets | undefined) {
  const url = useUrlSearchState();

  const orgTypes = url.getList('p_org');
  const requirements = url.getList('requirement');
  const platforms = url.getList('p_platform');
  const salesLeads = url.getList('sales_lead');
  const listLeads = url.getList('list_lead');
  const brandIds = url.getList('p_brand_id');
  const createdFrom = url.getString('created_from');
  const createdTo = url.getString('created_to');
  const converted = url.getString('converted'); // '', '1' or '0'

  const set = (updates: Parameters<typeof url.setParams>[0]) =>
    url.setParams(updates, { replace: true, resetPage: true });

  const options = useMemo(() => {
    const asOptions = (values: readonly string[]): DropdownOption[] =>
      values.map((value) => ({ value, label: value }));

    return {
      platform: (facets?.platforms ?? []).map((platform) => ({
        value: platform,
        label: PLATFORM_LABELS[platform] ?? platform,
        platform: platform as Platform,
      })),
      orgType: asOptions([...(facets?.org_types ?? [])].sort((a, b) => a.localeCompare(b))),
      requirement: (facets?.requirements ?? []).map((requirement) => ({
        value: requirement,
        label: PITCH_REQUIREMENT_LABELS[requirement] ?? requirement,
      })),
      salesLead: asOptions([...(facets?.sales_leads ?? [])].sort((a, b) => a.localeCompare(b))),
      listLead: asOptions([...(facets?.list_leads ?? [])].sort((a, b) => a.localeCompare(b))),
      brand: (facets?.brands ?? [])
        .map((brand) => ({ value: String(brand.id), label: brand.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [facets]);

  const counts: Record<FilterGroupKey, number> = {
    platform: platforms.length,
    type: orgTypes.length + requirements.length,
    brand: brandIds.length,
    team: salesLeads.length + listLeads.length,
    converted: converted ? 1 : 0,
    dates: createdFrom || createdTo ? 1 : 0,
  };

  const totalApplied = Object.values(counts).reduce((sum, count) => sum + count, 0);

  const values = {
    orgTypes,
    requirements,
    platforms,
    salesLeads,
    listLeads,
    brandIds,
    createdFrom,
    createdTo,
    converted,
  };

  const actions = {
    setPlatforms: (next: string[]) => set({ p_platform: next }),
    setOrgTypes: (next: string[]) => set({ p_org: next }),
    setRequirements: (next: string[]) => set({ requirement: next }),
    setSalesLeads: (next: string[]) => set({ sales_lead: next }),
    setListLeads: (next: string[]) => set({ list_lead: next }),
    setBrands: (next: string[]) => set({ p_brand_id: next }),
    setDates: (from: string, to: string) => set({ created_from: from || null, created_to: to || null }),
    setConverted: (next: '' | '1' | '0') => set({ converted: next || null }),
    clearAll: (clearQuery: boolean = false) =>
      set({
        p_org: null,
        requirement: null,
        p_platform: null,
        sales_lead: null,
        list_lead: null,
        p_brand_id: null,
        created_from: null,
        created_to: null,
        converted: null,
        ...(clearQuery && { q: null }),
      }),
  };

  const pills: FilterPill[] = useMemo(() => {
    const list: FilterPill[] = [];
    const drop = (values: string[], value: string) => values.filter((item) => item !== value);

    for (const value of platforms) {
      list.push({
        key: `platform:${value}`,
        label: PLATFORM_LABELS[value as Platform] ?? value,
        remove: () => set({ p_platform: drop(platforms, value) }),
      });
    }
    for (const value of orgTypes) {
      list.push({
        key: `org:${value}`,
        label: ORG_TYPE_LABELS[value as OrgType] ?? value,
        remove: () => set({ p_org: drop(orgTypes, value) }),
      });
    }
    for (const value of requirements) {
      list.push({
        key: `req:${value}`,
        label: PITCH_REQUIREMENT_LABELS[value as PitchRequirement] ?? value,
        remove: () => set({ requirement: drop(requirements, value) }),
      });
    }
    for (const value of salesLeads) {
      list.push({
        key: `sales:${value}`,
        label: `Sales: ${value}`,
        remove: () => set({ sales_lead: drop(salesLeads, value) }),
      });
    }
    for (const value of listLeads) {
      list.push({
        key: `list:${value}`,
        label: `List: ${value}`,
        remove: () => set({ list_lead: drop(listLeads, value) }),
      });
    }
    for (const value of brandIds) {
      const name = facets?.brands?.find((brand) => String(brand.id) === value)?.name ?? `Brand ${value}`;
      list.push({
        key: `brand:${value}`,
        label: name,
        remove: () => set({ p_brand_id: drop(brandIds, value) }),
      });
    }
    if (converted) {
      list.push({
        key: 'converted',
        label: converted === '1' ? 'Converted' : 'Not converted',
        remove: () => set({ converted: null }),
      });
    }
    if (createdFrom || createdTo) {
      list.push({
        key: 'dates',
        label: `Created ${createdFrom || 'any'} – ${createdTo || 'any'}`,
        remove: () => set({ created_from: null, created_to: null }),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    facets,
    platforms,
    orgTypes,
    requirements,
    salesLeads,
    listLeads,
    brandIds,
    converted,
    createdFrom,
    createdTo,
    url,
  ]);

  return { options, counts, totalApplied, values, actions, pills };
}
