import { useMemo } from 'react';
import { useUrlSearchState } from '@/hooks/useUrlSearchState';
import { PLATFORM_LABELS } from '@/lib/enums';
import { citiesIn, regionsIn, statesIn } from '@/lib/geo';
import type { CreatorFacets, Platform } from '@/types/api';
import type { DropdownOption } from '../../components/FilterDropdown';

export type FilterGroupKey = 'platform' | 'brand' | 'content' | 'location' | 'reach';

/** One removable pill above the results, and the state it removes. */
export interface FilterPill {
  key: string;
  label: string;
  remove: () => void;
}

/**
 * The creator rail's whole filter model, derived from the URL and the facets.
 *
 * It lives apart from the components that draw it because two of them need it:
 * the rail renders the groups, and the results header renders the same
 * selections as pills. Deriving it twice would be two chances to disagree about
 * what "applied" means.
 */
export function useCreatorFilterModel(
  facets: CreatorFacets | undefined,
) {
  const url = useUrlSearchState();

  const platforms = url.getList('platform');
  const brandIds = url.getList('c_brand');
  const categories = url.getList('category');
  const languages = url.getList('language');
  const tags = url.getList('tag');
  const regions = url.getList('region');
  const states = url.getList('state');
  const cities = url.getList('city');
  const folMin = url.getString('min_followers');
  const folMax = url.getString('max_followers');
  const viewMin = url.getString('min_views');
  const viewMax = url.getString('max_views');

  /** Every filter change resets to page 1 — page 7 of a smaller set is a dead end. */
  const set = (updates: Parameters<typeof url.setParams>[0]) =>
    url.setParams(updates, { replace: true, resetPage: true });

  const facetCities = useMemo(() => facets?.cities ?? [], [facets]);

  const options = useMemo(() => {
    const asOptions = (values: readonly string[]): DropdownOption[] =>
      values.map((value) => ({ value, label: value }));

    return {
      platform: (facets?.platforms ?? []).map((platform) => ({
        value: platform,
        label: PLATFORM_LABELS[platform] ?? platform,
        platform: platform as Platform,
      })),
      brand: (facets?.brands ?? [])
        .map((brand) => ({ value: String(brand.id), label: brand.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      category: asOptions([...(facets?.categories ?? [])].sort((a, b) => a.localeCompare(b))),
      language: asOptions([...(facets?.languages ?? [])].sort((a, b) => a.localeCompare(b))),
      // Region narrows State, and Region + State narrow City. All three are
      // computed from the city facet — see lib/geo.ts.
      region: regionsIn(facetCities).map((region) => ({ value: region, label: `${region} India` })),
      state: asOptions(statesIn(facetCities, regions)),
      city: asOptions(citiesIn(facetCities, regions, states)),
    };
  }, [facets, facetCities, regions, states]);

  /** Applied-filter counts, per group, for the badge on each group header. */
  const counts: Record<FilterGroupKey, number> = {
    platform: platforms.length,
    brand: brandIds.length,
    content: categories.length + languages.length + tags.length,
    location: regions.length + states.length + cities.length,
    reach: (folMin || folMax ? 1 : 0) + (viewMin || viewMax ? 1 : 0),
  };

  const totalApplied = Object.values(counts).reduce((sum, count) => sum + count, 0);

  const values = {
    platforms,
    brandIds,
    categories,
    languages,
    tags,
    regions,
    states,
    cities,
    folMin,
    folMax,
    viewMin,
    viewMax,
  };

  const actions = {
    setPlatforms: (next: string[]) => set({ platform: next }),
    setBrands: (next: string[]) => set({ c_brand: next }),
    setCategories: (next: string[]) => set({ category: next }),
    setLanguages: (next: string[]) => set({ language: next }),
    setTags: (next: string[]) => set({ tag: next }),
    // Changing Region clears State and City; changing State clears City. Keeping
    // a city that the new region doesn't contain would produce a filter pair
    // that can only ever return nothing.
    setRegions: (next: string[]) => set({ region: next, state: null, city: null }),
    setStates: (next: string[]) => set({ state: next, city: null }),
    setCities: (next: string[]) => set({ city: next }),
    setFollowers: (min: string, max: string) => set({ min_followers: min, max_followers: max }),
    setViews: (min: string, max: string) => set({ min_views: min, max_views: max }),
    clearAll: (clearQuery: boolean = false) =>
      set({
        platform: null,
        c_brand: null,
        category: null,
        language: null,
        tag: null,
        region: null,
        state: null,
        city: null,
        min_followers: null,
        max_followers: null,
        min_views: null,
        max_views: null,
        ...(clearQuery && {q: null})
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
        remove: () => set({ platform: drop(platforms, value) }),
      });
    }
    for (const value of brandIds) {
      const name =
        facets?.brands?.find((brand) => String(brand.id) === value)?.name ??
        `Brand ${value}`;
      list.push({
        key: `brand:${value}`,
        label: `Worked with ${name}`,
        remove: () => set({ c_brand: drop(brandIds, value) }),
      });
    }
    for (const value of categories) {
      list.push({
        key: `category:${value}`,
        label: value,
        remove: () => set({ category: drop(categories, value) }),
      });
    }
    for (const value of languages) {
      list.push({
        key: `language:${value}`,
        label: `Speaks ${value}`,
        remove: () => set({ language: drop(languages, value) }),
      });
    }
    for (const value of tags) {
      list.push({
        key: `tag:${value}`,
        label: value,
        remove: () => set({ tag: drop(tags, value) }),
      });
    }
    for (const value of regions) {
      list.push({
        key: `region:${value}`,
        label: `${value} India`,
        // Same cascade as the control: dropping a region drops what it narrowed.
        remove: () =>
          set({ region: drop(regions, value), state: null, city: null }),
      });
    }
    for (const value of states) {
      list.push({
        key: `state:${value}`,
        label: value,
        remove: () => set({ state: drop(states, value), city: null }),
      });
    }
    for (const value of cities) {
      list.push({
        key: `city:${value}`,
        label: value,
        remove: () => set({ city: drop(cities, value) }),
      });
    }
    if (folMin || folMax) {
      list.push({
        key: "followers",
        label: `Followers ${folMin || "any"}–${folMax || "any"}`,
        remove: () => set({ min_followers: null, max_followers: null }),
      });
    }
    if (viewMin || viewMax) {
      list.push({
        key: "views",
        label: `Views ${viewMin || "any"}–${viewMax || "any"}`,
        remove: () => set({ min_views: null, max_views: null }),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    facets,
    platforms,
    brandIds,
    categories,
    languages,
    tags,
    regions,
    states,
    cities,
    folMin,
    folMax,
    viewMin,
    viewMax,
    url,
  ]);

  return { options, counts, totalApplied, values, actions, pills };
}
