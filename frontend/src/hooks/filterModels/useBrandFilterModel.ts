import { useMemo } from "react";
import { useUrlSearchState } from "@/hooks/useUrlSearchState";
import { PLATFORM_LABELS } from "@/lib/enums";
import type { BrandFacets, Platform } from "@/types/api";
import type { DropdownOption } from "../../components/FilterDropdown";

export type FilterGroupKey =
  | "org_type"
  | "platform"
  | "campCount"
  | "pitchCount";

/** One removable pill above the results, and the state it removes. */
export interface FilterPill {
  key: string;
  label: string;
  remove: () => void;
}

export function useBrandFilterModel(facets: BrandFacets | undefined) {
  const url = useUrlSearchState();

  const orgTypes = url.getList("b_org");
  const platforms = url.getList("b_platform");
  const campMin = url.getString("min_campaigns");
  const campMax = url.getString("max_campaigns");
  const pitchMin = url.getString("min_pitches");
  const pitchMax = url.getString("max_pitches");

  // at filter change, reset page number to first page of results
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
      orgType: asOptions(
        [...(facets?.org_types ?? [])].sort((a, b) => a.localeCompare(b)),
      ),
    };
  }, [facets]);

  /** Applied-filter counts, per group, for the badge on each group header. */
  const counts: Record<FilterGroupKey, number> = {
    platform: platforms.length,
    org_type: orgTypes.length,
    campCount: campMin || campMax ? 1 : 0,
    pitchCount: pitchMin || pitchMax ? 1 : 0,
  };

  const totalApplied = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0,
  );

  const values = {
    platforms,
    orgTypes,
    campMin,
    campMax,
    pitchMin,
    pitchMax,
  };

  const actions = {
    setPlatforms: (next: string[]) => set({ b_platform: next }),
    setOrgTypes: (next: string[]) => set({ b_org: next }),
    setCampaignCounts: (min: string, max: string) =>
      set({ min_campaigns: min, max_campaigns: max }),
    setPitchCounts: (min: string, max: string) =>
      set({ min_pitches: min, max_pitches: max }),
    clearAll: (clearQuery: boolean = false) =>
      set({
        b_platform: null,
        b_org: null,
        min_campaigns: null,
        max_campaigns: null,
        min_pitches: null,
        max_pitches: null,
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
    if (campMin || campMax) {
      list.push({
        key: "campaignRange",
        label: `Campaigns ${campMin || "any"}–${campMax || "any"}`,
        remove: () => set({ min_campaigns: null, max_campaigns: null }),
      });
    }
    if (pitchMin || pitchMax) {
      list.push({
        key: "pitchRange",
        label: `Pitches ${pitchMin || "any"}–${pitchMax || "any"}`,
        remove: () => set({ min_pitches: null, max_pitches: null }),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platforms, orgTypes, campMin, campMax, pitchMin, pitchMax, url]);

  return { options, counts, totalApplied, values, actions, pills };
}
