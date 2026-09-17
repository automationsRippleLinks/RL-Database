import { Building2, ChevronDown, Globe, MapPin, Tag, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreatorFacets } from '@/types/api';
import { FilterDropdown } from './FilterDropdown';
import { RangeControl } from './RangeControl';
import { TagsControl } from './TagsControl';
import type { FilterGroupKey, useCreatorFilterModel } from './useCreatorFilterModel';

type FilterModel = ReturnType<typeof useCreatorFilterModel>;

const GROUPS: { key: FilterGroupKey; label: string; icon: LucideIcon }[] = [
  { key: 'platform', label: 'Platform', icon: Globe },
  { key: 'brand', label: 'Brand', icon: Building2 },
  { key: 'content', label: 'Attributes', icon: Tag },
  { key: 'location', label: 'Location', icon: MapPin },
  { key: 'reach', label: 'Reach', icon: Users },
];

interface CreatorFilterGroupsProps {
  model: FilterModel;
  facets: CreatorFacets | undefined;
  /** Expanded or hover-peeked — either way there is room for labels and bodies. */
  railOpen: boolean;
  openGroup: FilterGroupKey | null;
  onOpenGroup: (key: FilterGroupKey | null) => void;
  openMenu: string | null;
  onOpenMenu: (key: string | null) => void;
  /** Clicking a group glyph in the collapsed rail pins it open on that group. */
  onExpandRail: () => void;
}

/**
 * The five filter drawers, as an accordion — one open at a time. Five groups
 * each holding up to three controls do not fit in a 214px column at once, and an
 * accordion means the open one is always the one being worked on.
 */
export function CreatorFilterGroups({
  model,
  facets,
  railOpen,
  openGroup,
  onOpenGroup,
  openMenu,
  onOpenMenu,
  onExpandRail,
}: CreatorFilterGroupsProps) {
  const menuProps = (key: string) => ({
    open: openMenu === key,
    onToggle: () => onOpenMenu(openMenu === key ? null : key),
  });

  return (
    <>
      {GROUPS.map(({ key, label, icon: Icon }) => {
        const count = model.counts[key];
        const open = openGroup === key && railOpen;

        return (
          <div key={key} className="shrink-0">
            <button
              type="button"
              title={`${label}${count ? ` — ${count} applied` : ''}`}
              aria-expanded={open}
              onClick={() => {
                // From the collapsed rail this both pins the rail open and opens
                // the group, which is the only way to reach a filter from icons.
                if (!railOpen) {
                  onExpandRail();
                  onOpenGroup(key);
                  return;
                }
                onOpenGroup(openGroup === key ? null : key);
                onOpenMenu(null);
              }}
              className={cn(
                'relative flex w-full cursor-pointer items-center gap-[9px] rounded-[9px] py-[9px] text-[12.5px] font-semibold transition-colors',
                railOpen ? 'px-[9px]' : 'justify-center overflow-visible px-0',
                open ? 'bg-rp-surface2' : 'hover:bg-rp-surface2/60',
                count ? 'text-rp-primary' : 'text-rp-text',
              )}
            >
              <Icon className="size-[17px] shrink-0" />
              <RailLabel open={railOpen}>{label}</RailLabel>

              {count > 0 &&
                (railOpen ? (
                  <span className="shrink-0 rounded-full bg-rp-primary-soft px-[5px] py-px text-center text-[10px] font-bold tabular-nums text-rp-primary">
                    {count}
                  </span>
                ) : (
                  // Pinned to the glyph's corner with a ring in the rail's own
                  // background, so it reads as a badge and not as part of the icon.
                  <span className="absolute top-px right-px min-w-[14px] rounded-full border-[1.5px] border-rp-bg bg-rp-primary px-[3px] text-center text-[8.5px] leading-[13px] font-bold text-rp-primary-fg">
                    {count}
                  </span>
                ))}

              {railOpen && (
                <ChevronDown
                  className={cn(
                    'size-[13px] shrink-0 opacity-70 transition-transform',
                    open && 'rotate-180',
                  )}
                  strokeWidth={2.2}
                />
              )}
            </button>

            {open && (
              <div data-rp-pop="menu" className="flex flex-col gap-[11px] px-[9px] pt-1 pb-3">
                {key === 'platform' && (
                  <FilterDropdown
                    label="Platform"
                    options={model.options.platform}
                    selected={model.values.platforms}
                    onChange={model.actions.setPlatforms}
                    {...menuProps('platform')}
                  />
                )}

                {key === 'brand' && (
                  <FilterDropdown
                    label="Worked with"
                    searchable
                    options={model.options.brand}
                    selected={model.values.brandIds}
                    onChange={model.actions.setBrands}
                    emptyHint="No brands on file yet."
                    {...menuProps('brand')}
                  />
                )}

                {key === 'content' && (
                  <>
                    <FilterDropdown
                      label="Category"
                      searchable
                      options={model.options.category}
                      selected={model.values.categories}
                      onChange={model.actions.setCategories}
                      {...menuProps('category')}
                    />
                    <FilterDropdown
                      label="Language"
                      options={model.options.language}
                      selected={model.values.languages}
                      onChange={model.actions.setLanguages}
                      {...menuProps('language')}
                    />
                    <TagsControl
                      vocabulary={facets?.tags}
                      selected={model.values.tags}
                      onChange={model.actions.setTags}
                    />
                  </>
                )}

                {key === 'location' && (
                  <>
                    <FilterDropdown
                      label="Region"
                      options={model.options.region}
                      selected={model.values.regions}
                      onChange={model.actions.setRegions}
                      {...menuProps('region')}
                    />
                    <FilterDropdown
                      label="State"
                      searchable
                      options={model.options.state}
                      selected={model.values.states}
                      onChange={model.actions.setStates}
                      {...menuProps('state')}
                    />
                    <FilterDropdown
                      label="City"
                      searchable
                      options={model.options.city}
                      selected={model.values.cities}
                      onChange={model.actions.setCities}
                      {...menuProps('city')}
                    />
                  </>
                )}

                {key === 'reach' && (
                  <>
                    <RangeControl
                      label="Followers"
                      min={model.values.folMin}
                      max={model.values.folMax}
                      onChange={model.actions.setFollowers}
                    />
                    {/* <RangeControl
                      label="Avg views"
                      min={model.values.viewMin}
                      max={model.values.viewMax}
                      onChange={model.actions.setViews}
                    /> */}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * Rail labels collapse rather than disappear: opacity and max-width animate to
 * zero in step with the rail's own width transition, so nothing pops.
 */
export function RailLabel({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'min-w-0 overflow-hidden text-left whitespace-nowrap',
        open
          ? 'max-w-[200px] flex-1 opacity-100 transition-[opacity,max-width] delay-[50ms] duration-200 ease-out'
          : 'max-w-0 flex-[0_0_0] opacity-0 transition-[opacity,max-width] duration-200 ease-out',
      )}
    >
      {children}
    </span>
  );
}
