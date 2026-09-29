import { Building2, Calendar, CheckCircle2, ChevronDown, Globe, Tag, Users, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PitchFacets } from '@/types/api';
import { DateRangeControl } from '@/components/DateRangeControl';
import { FilterDropdown } from '../FilterDropdown';
import { IconFilter } from '../IconFilter';
import type { FilterGroupKey, usePitchFilterModel } from '../../hooks/filterModels/usePitchFilterModel';
import { RailLabel } from './CreatorFilters';

type FilterModel = ReturnType<typeof usePitchFilterModel>;

const GROUPS: { key: FilterGroupKey; label: string; icon: LucideIcon }[] = [
  { key: 'platform', label: 'Platform', icon: Globe },
  { key: 'type', label: 'Type', icon: Tag },
  { key: 'brand', label: 'Brand', icon: Building2 },
  { key: 'team', label: 'Team', icon: Users },
  { key: 'converted', label: 'Converted', icon: CheckCircle2 },
  { key: 'dates', label: 'Created', icon: Calendar },
];

const CONVERTED_OPTIONS = [
  { value: '1', label: 'Converted', icon: CheckCircle2 },
  { value: '0', label: 'Not converted', icon: XCircle },
];

interface PitchFilterGroupsProps {
  model: FilterModel;
  facets: PitchFacets | undefined;
  railOpen: boolean;
  openGroup: FilterGroupKey | null;
  onOpenGroup: (key: FilterGroupKey | null) => void;
  openMenu: string | null;
  onOpenMenu: (key: string | null) => void;
  onExpandRail: () => void;
}

/** Same accordion shell as CreatorFilters/BrandFilters — see CreatorFilters.tsx. */
export default function PitchFilters({
  model,
  facets: _facets,
  railOpen,
  openGroup,
  onOpenGroup,
  openMenu,
  onOpenMenu,
  onExpandRail,
}: PitchFilterGroupsProps) {
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
                  <span className="absolute top-px right-px min-w-3.5 rounded-full border-[1.5px] border-rp-bg bg-rp-primary px-0.75 text-center text-[8.5px] leading-3.25 font-bold text-rp-primary-fg">
                    {count}
                  </span>
                ))}

              {railOpen && (
                <ChevronDown
                  className={cn('size-3.25 shrink-0 opacity-70 transition-transform', open && 'rotate-180')}
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

                {key === 'type' && (
                  <div className="flex flex-col gap-1.8 rounded-[9px] border border-rp-border bg-rp-surface p-0.5">
                    <FilterDropdown
                      label="Org type"
                      searchable
                      options={model.options.orgType}
                      selected={model.values.orgTypes}
                      onChange={model.actions.setOrgTypes}
                      inline
                      {...menuProps('org_type')}
                    />
                    <FilterDropdown
                      label="Requirement"
                      searchable
                      options={model.options.requirement}
                      selected={model.values.requirements}
                      onChange={model.actions.setRequirements}
                      inline
                      {...menuProps('requirement')}
                    />
                  </div>
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

                {key === 'team' && (
                  <div className="flex flex-col gap-1.8 rounded-[9px] border border-rp-border bg-rp-surface p-0.5">
                    <FilterDropdown
                      label="Sales lead"
                      searchable
                      options={model.options.salesLead}
                      selected={model.values.salesLeads}
                      onChange={model.actions.setSalesLeads}
                      emptyHint="No sales leads"
                      inline
                      {...menuProps('sales_lead')}
                    />
                    <FilterDropdown
                      label="List lead"
                      searchable
                      options={model.options.listLead}
                      selected={model.values.listLeads}
                      onChange={model.actions.setListLeads}
                      emptyHint="No list leads"
                      inline
                      {...menuProps('list_lead')}
                    />
                  </div>
                )}

                {key === 'converted' && (
                  <IconFilter
                    options={CONVERTED_OPTIONS}
                    selected={model.values.converted ? [model.values.converted] : []}
                    onChange={(values) => {
                      const next = values[values.length - 1];
                      model.actions.setConverted((next as '1' | '0') ?? '');
                    }}
                  />
                )}

                {key === 'dates' && (
                  <DateRangeControl
                    label="Created between"
                    from={model.values.createdFrom}
                    to={model.values.createdTo}
                    onChange={model.actions.setDates}
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
