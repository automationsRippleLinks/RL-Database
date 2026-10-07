import { Activity, Building2, ChevronDown, Calendar, User, CircleHelp, Clock, PauseCircle, XCircle, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CampaignFacets } from '@/types/api';
import { DateRangeControl } from '@/components/DateRangeControl';
import { FilterDropdown } from '../FilterDropdown';
import type { FilterGroupKey, useCampaignFilterModel } from '../../hooks/filterModels/useCampaignFilterModel';
import { RailLabel } from './CreatorFilters';
import { IconFilter } from '../IconFilter';

type FilterModel = ReturnType<typeof useCampaignFilterModel>;

const GROUPS: { key: FilterGroupKey; label: string; icon: LucideIcon }[] = [
  { key: 'status', label: 'Status', icon: Activity },
  { key: 'period', label: 'Period', icon: Calendar },
  { key: 'manager', label: 'Manager', icon: User },
  { key: 'brand', label: 'Brand', icon: Building2 },
  // { key: 'dates', label: 'Start date', icon: Calendar },
];
// ── CAMPAIGN AND REPORT STATUS ICONS ───────────────────────────
// const STATUS_ICONS: Record<string, LucideIcon> = {
//   wip: Clock,
//   completed: Check,
//   'on hold': PauseCircle,
//   scrapped: XCircle,
// };


const STATUS_STYLE: Record<
  string,
  { icon: LucideIcon; iconClassName: string }
> = {
  wip: {
    icon: Clock,
    iconClassName: 'text-rp-primary',
  },
  completed: {
    icon: Check,
    iconClassName: 'text-rp-success',
  },
  'on hold': {
    icon: PauseCircle,
    iconClassName: 'text-rp-warn',
  },
  scrapped: {
    icon: XCircle,
    iconClassName: 'text-rp-danger',
  },
};

interface CampaignFilterGroupsProps {
  model: FilterModel;
  facets: CampaignFacets | undefined;
  railOpen: boolean;
  openGroup: FilterGroupKey | null;
  onOpenGroup: (key: FilterGroupKey | null) => void;
  openMenu: string | null;
  onOpenMenu: (key: string | null) => void;
  onExpandRail: () => void;
}

/** Same accordion shell as CreatorFilters/BrandFilters — see CreatorFilters.tsx. */
export default function CampaignFilters({
  model,
  facets: _facets,
  railOpen,
  openGroup,
  onOpenGroup,
  openMenu,
  onOpenMenu,
  onExpandRail,
}: CampaignFilterGroupsProps) 
{
  // const menuProps = (key: string) => ({
  //   open: openMenu === key,
  //   onToggle: () => onOpenMenu(openMenu === key ? null : key),
  // });

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

                {key === 'status' && (
                  <div className="flex flex-col gap-2">

                    {/* CAMPAIGN STATUS DROPDOWN */}
                    <div>
                      <button
                        type="button"
                        aria-expanded={openMenu === 'campaign-status'}
                        onClick={() =>
                          onOpenMenu(
                            openMenu === 'campaign-status'
                              ? null
                              : 'campaign-status'
                          )
                        }
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[12px] font-semibold text-rp-text transition-colors',
                          openMenu === 'campaign-status'
                            ? 'bg-rp-surface2'
                            : 'bg-rp-surface hover:bg-rp-surface2'
                        )}
                      >
                        <span className="flex items-center gap-2">
                          Campaign Status

                          {model.values.statuses.length > 0 && (
                            <span className="rounded-full bg-rp-primary-soft px-1.5 text-[10px] text-rp-primary">
                              {model.values.statuses.length}
                            </span>
                          )}
                        </span>

                        <ChevronDown
                          className={cn(
                            'size-3.5 transition-transform',
                            openMenu === 'campaign-status' && 'rotate-180'
                          )}
                        />
                      </button>

                      {openMenu === 'campaign-status' && (
                        <div className="mt-1 px-1 py-2">
                          <IconFilter
                            options={model.options.status.map((option) => ({
                              ...option,
                              icon:
                                STATUS_STYLE[option.value]?.icon ?? CircleHelp,
                              iconClassName:
                                STATUS_STYLE[option.value]?.iconClassName ??
                                'text-rp-muted',
                            }))}
                            selected={model.values.statuses}
                            onChange={model.actions.setStatuses}
                          />
                        </div>
                      )}
                    </div>

                    {/* REPORT STATUS DROPDOWN */}
                    <div>
                      <button
                        type="button"
                        aria-expanded={openMenu === 'report-status'}
                        onClick={() =>
                          onOpenMenu(
                            openMenu === 'report-status'
                              ? null
                              : 'report-status'
                          )
                        }
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[12px] font-semibold text-rp-text transition-colors',
                          openMenu === 'report-status'
                            ? 'bg-rp-surface2'
                            : 'bg-rp-surface hover:bg-rp-surface2'
                        )}
                      >
                        <span className="flex items-center gap-2">
                          Report Status

                          {model.values.reportStatuses.length > 0 && (
                            <span className="rounded-full bg-rp-primary-soft px-1.5 text-[10px] text-rp-primary">
                              {model.values.reportStatuses.length}
                            </span>
                          )}
                        </span>

                        <ChevronDown
                          className={cn(
                            'size-3.5 transition-transform',
                            openMenu === 'report-status' && 'rotate-180'
                          )}
                        />
                      </button>

                      {openMenu === 'report-status' && (
                        <div className="mt-1 px-1 py-2">
                          <IconFilter
                            options={model.options.reportStatus.map((option) => ({
                              ...option,
                              icon:
                                STATUS_STYLE[option.value]?.icon ?? CircleHelp,
                              iconClassName:
                                STATUS_STYLE[option.value]?.iconClassName ??
                                'text-rp-muted',
                            }))}
                            selected={model.values.reportStatuses}
                            onChange={model.actions.setReportStatuses}
                          />
                        </div>
                      )}
                    </div>

                  </div>
                )}



                {key === 'period' && (
                  <DateRangeControl
                    label="Campaign period"
                    from={model.values.startFrom}
                    to={model.values.startTo}
                    onChange={model.actions.setDates}
                  />
                )}

                {key === 'manager' && (
                  <FilterDropdown
                    label="Manager"
                    searchable
                    options={model.options.manager}
                    selected={model.values.managers}
                    onChange={model.actions.setManagers}
                    emptyHint="No managers"
                    inline
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

              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
