import { Building2, ChevronDown, Globe, MapPin, Tag, Users, MapIcon, Contact as ContactIcon, Mail, Phone, Package } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreatorFacets } from '@/types/api';
import { FilterDropdown } from '../FilterDropdown';
import { RangeControl } from '../RangeControl';
import { TagsControl } from '../TagsControl';
import { IconFilter } from '../IconFilter';
import type { FilterGroupKey, useCreatorFilterModel } from '../../hooks/filterModels/useCreatorFilterModel';

type FilterModel = ReturnType<typeof useCreatorFilterModel>;

const GROUPS: { key: FilterGroupKey; label: string; icon: LucideIcon }[] = [
  { key: 'platform', label: 'Platform', icon: Globe },
  { key: 'brand', label: 'Brand', icon: Building2 },
  { key: 'content', label: 'Attributes', icon: Tag },
  { key: 'location', label: 'Location', icon: MapPin },
  { key: 'reach', label: 'Reach', icon: Users },
  { key: 'contact', label: 'Contact', icon: ContactIcon },
  { key: 'deliverables', label: 'Deliverables', icon: Package },
];
const CONTACT_OPTIONS = [
  { value: 'contact', label: 'Has Contact', icon: ContactIcon },
  { value: 'email', label: 'Has Email', icon: Mail },
  { value: 'phone', label: 'Has Phone', icon: Phone },
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
 * Filter groups are rendered as an accordion with one group open at a time.
 * This keeps the filter rail compact while allowing each group enough space
 * for its controls.
 */
export default function CreatorFilters({
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
                'relative flex w-full cursor-pointer items-center gap-2.25 rounded-[9px] py-2.25 text-[12.5px] font-semibold transition-colors',
                railOpen ? 'px-2.25' : 'justify-center overflow-visible px-0',
                open ? 'bg-rp-surface2' : 'hover:bg-rp-surface2/60',
                count ? 'text-rp-primary' : 'text-rp-text',
              )}
            >
              <Icon className="size-4.25 shrink-0" />
              <RailLabel open={railOpen}>{label}</RailLabel>

              {count > 0 &&
                (railOpen ? (
                  <span className="shrink-0 rounded-full bg-rp-primary-soft px-1.25 py-px text-center text-[10px] font-bold tabular-nums text-rp-primary">
                    {count}
                  </span>
                ) : (
                  // Pinned to the glyph's corner with a ring in the rail's own
                  // background, so it reads as a badge and not as part of the icon.
                  <span className="absolute top-px right-px min-w-3.5 rounded-full border-[1.5px] border-rp-bg bg-rp-primary px-0.75 text-center text-[8.5px] leading-3.25 font-bold text-rp-primary-fg">
                    {count}
                  </span>
                ))}

              {railOpen && (
                <ChevronDown
                  className={cn(
                    'size-3.25 shrink-0 opacity-70 transition-transform',
                    open && 'rotate-180',
                  )}
                  strokeWidth={2.2}
                />
              )}
            </button>

            {open && (
              <div data-rp-pop="menu" className="flex flex-col gap-2.75 px-2.25 pt-1 pb-3">

                {key === 'platform' && (
                  <IconFilter
                    options={model.options.platform}
                    selected={model.values.platforms}
                    onChange={model.actions.setPlatforms}
                  />
                )}
                {key === 'brand' && (
                  <FilterDropdown
                    label="Brand"
                    searchable
                    options={model.options.brand}
                    selected={model.values.brandIds}
                    onChange={model.actions.setBrands}
                    emptyHint="No brands"
                    inline
                  />
                )}


                {key === 'content' && (
                  <div className="flex flex-col gap-1.8 rounded-[9px] border border-rp-border bg-rp-surface p-0.5">
                    <FilterDropdown
                      label="Category"
                      icon={Tag}
                      searchable
                      options={model.options.category}
                      selected={model.values.categories}
                      onChange={model.actions.setCategories}
                      inline
                      {...menuProps('category')}
                    />
                    <FilterDropdown
                      label="Language"
                      icon={Globe}
                      searchable
                      options={model.options.language}
                      selected={model.values.languages}
                      onChange={model.actions.setLanguages}
                      inline
                      {...menuProps('language')}
                    />
                    <TagsControl
                      vocabulary={facets?.tags}
                      selected={model.values.tags}
                      onChange={model.actions.setTags}
                      {...menuProps('tags')}

                    />
                  </div>
                )}

                {key === 'location' && (
                  <div className="flex flex-col gap-1.8 rounded-[9px] border border-rp-border bg-rp-surface p-0.5">

                    <FilterDropdown
                      label="City"
                      icon={MapPin}
                      searchable
                      options={model.options.city}
                      selected={model.values.cities}
                      onChange={model.actions.setCities}
                      inline
                      {...menuProps('city')}
                    />
                    <FilterDropdown
                      label="State"
                      icon={MapIcon}
                      searchable
                      options={model.options.state}
                      selected={model.values.states}
                      onChange={model.actions.setStates}
                      inline
                      {...menuProps('state')}
                    />
                    <FilterDropdown
                      label="Region"
                      searchable
                      icon={Globe}
                      options={model.options.region}
                      selected={model.values.regions}
                      onChange={model.actions.setRegions}
                      inline
                      {...menuProps('region')}
                    />
                  </div>
                )}
                {key === 'contact' && (
                  <IconFilter
                    options={CONTACT_OPTIONS}
                    // selected={model.values.contact ? [model.values.contact] : []}
                    selected={model.values.contact && model.values.contact !== 'none' ? [model.values.contact] : []} onChange={(values) =>
                      model.actions.setContact(values[values.length - 1] ?? null)
                    }
                  />
                )}
                {key === 'deliverables' && (
                  <>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <span className="relative flex size-4 shrink-0 items-center justify-center">
                        <input
                          type="checkbox"
                          checked={Boolean(model.values.hasPackage)}
                          onChange={(event) =>
                            model.actions.setHasPackage(event.target.checked)
                          }
                          className="peer size-4 cursor-pointer appearance-none rounded-full border border-current bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary"
                        />

                        {/* Show only a tick inside the circle when selected. */}
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                          className="pointer-events-none absolute size-3 hidden peer-checked:block"
                        >
                          <path d="m5 12 4 4 10-10" />
                        </svg>
                      </span>

                      <span>Has package</span>
                    </label>

                    <RangeControl
                      label="Package cost (₹)"
                      min={model.values.pkgMin}
                      max={model.values.pkgMax}
                      onChange={model.actions.setPackageCost}
                    />
                  </>
                )}


                {/*Followers*/}
                {key === 'reach' && (
                  <RangeControl
                    label="Followers"
                    min={model.values.folMin}
                    max={model.values.folMax}
                    onChange={model.actions.setFollowers}
                  />
                )}
                {/*Average views*/}
                {key === 'reach' && (
                  <RangeControl
                    label="Average Views"
                    min={model.values.viewMin}
                    max={model.values.viewMax}
                    onChange={model.actions.setViews}
                  />
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
          ? 'max-w-50 flex-1 opacity-100 transition-[opacity,max-width] delay-50 duration-200 ease-out'
          : 'max-w-0 flex-[0_0_0] opacity-0 transition-[opacity,max-width] duration-200 ease-out',
      )}
    >
      {children}
    </span>
  );
}
