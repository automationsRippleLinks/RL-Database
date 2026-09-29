import { useMemo } from "react";
import { useUrlSearchState } from "@/hooks/useUrlSearchState";
import { PLATFORMS, PLATFORM_LABELS } from '@/lib/enums';
import type { BrandFacets, Platform } from "@/types/api";
import type { DropdownOption } from "../../components/FilterDropdown";

export type FilterGroupKey =
  | "org_type"
  | "platform"
  | "campCount"
  | "pitchCount"
  | "billing";

/** One removable pill above the results, and the state it removes. */
export interface FilterPill {
  key: string;
  label: string;
  remove: () => void;
}

/**
 * The brand rail's whole filter model, derived from the URL and the facets —
 * same shape as useCreatorFilterModel, so the rail and the results header can
 * treat every scope identically.
 *
 * Campaign/pitch count only ever sends a lower bound: BrandSearchRequest
 * (frontend and backend both) has no max_campaigns/max_pitches field, so
 * there is nothing here for an upper bound to do. Earlier versions of this
 * hook tracked one anyway — it rendered a "5–20" pill while the API silently
 * ignored the 20, which is worse than not offering it.
 */
export function useBrandFilterModel(facets: BrandFacets | undefined) {
  const url = useUrlSearchState();

  const orgTypes = url.getList("b_org");
  const platforms = url.getList("b_platform");
  const campMin = url.getString("min_campaigns");
  const pitchMin = url.getString("min_pitches");
  const hasCompany = url.getBool("has_company");
  const hasGstin = url.getBool("has_gstin");

  // at filter change, reset page number to first page of results
  const set = (updates: Parameters<typeof url.setParams>[0]) =>
    url.setParams(updates, { replace: true, resetPage: true });

  const options = useMemo(() => {
    const asOptions = (values: readonly string[]): DropdownOption[] =>
      values.map((value) => ({ value, label: value }));

    return {
      platform: PLATFORMS.map((platform) => ({
        value: platform,
        label: PLATFORM_LABELS[platform] ?? platform,
        platform,
      })),
      orgType: asOptions(
        [...(facets?.org_types ?? [])].sort((a, b) => a.localeCompare(b)),
      ),
    };
  }, [facets]);

  /** Applied-filter counts, per group, for the badge on each group header. */
  const counts: Record<FilterGroupKey, number> = {
    platform: platforms.length,
    org_type: orgTypes.length,
    campCount: campMin ? 1 : 0,
    pitchCount: pitchMin ? 1 : 0,
    billing: (hasCompany ? 1 : 0) + (hasGstin ? 1 : 0),
  };

  const totalApplied = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0,
  );

  const values = {
    platforms,
    orgTypes,
    campMin,
    pitchMin,
    hasCompany,
    hasGstin,
  };

  const actions = {
    // setPlatforms: (next: string[]) => set({ b_platform: next }),
    // setOrgTypes: (next: string[]) => set({ b_org: next }),
    setMinCampaigns: (min: string) => set({ min_campaigns: min || null }),
    setMinPitches: (min: string) => set({ min_pitches: min || null }),
    setHasCompany: (checked: boolean) => set({ has_company: checked || null }),
    setHasGstin: (checked: boolean) => set({ has_gstin: checked || null }),
    clearAll: (clearQuery: boolean = false) =>
      set({
        // b_platform: null,
        // b_org: null,
        min_campaigns: null,
        min_pitches: null,
        has_company: null,
        has_gstin: null,
        ...(clearQuery && { q: null }),
      }),
  };

  const pills: FilterPill[] = useMemo(() => {
    const list: FilterPill[] = [];
    const drop = (values: string[], value: string) =>
      values.filter((item) => item !== value);

    for (const value of platforms) {
      list.push({
        key: `platform:${value}`,
        label: PLATFORM_LABELS[value as Platform] ?? value,
        remove: () => set({ b_platform: drop(platforms, value) }),
      });
    }
    for (const value of orgTypes) {
      list.push({
        key: `orgType:${value}`,
        label: value,
        remove: () => set({ b_org: drop(orgTypes, value) }),
      });
    }
    if (campMin) {
      list.push({
        key: "campaignMin",
        label: `${campMin}+ campaigns`,
        remove: () => set({ min_campaigns: null }),
      });
    }
    if (pitchMin) {
      list.push({
        key: "pitchMin",
        label: `${pitchMin}+ pitches`,
        remove: () => set({ min_pitches: null }),
      });
    }
    if (hasCompany) {
      list.push({
        key: "hasCompany",
        label: "Has billing company",
        remove: () => set({ has_company: null }),
      });
    }
    if (hasGstin) {
      list.push({
        key: "hasGstin",
        label: "Has GSTIN",
        remove: () => set({ has_gstin: null }),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platforms, orgTypes, campMin, pitchMin, hasCompany, hasGstin, url]);

  return { options, counts, totalApplied, values, actions, pills };
}
