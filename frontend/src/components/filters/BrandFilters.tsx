import { ChevronDown, Megaphone, FileText, Receipt } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BrandFacets } from "@/types/api";
// import { FilterDropdown } from "../FilterDropdown";
// import { IconFilter } from "../IconFilter";
import type { FilterGroupKey, useBrandFilterModel } from "../../hooks/filterModels/useBrandFilterModel";
import { RailLabel } from "./CreatorFilters";

type FilterModel = ReturnType<typeof useBrandFilterModel>;

const GROUPS: { key: FilterGroupKey; label: string; icon: LucideIcon }[] = [
  // { key: "platform", label: "Platform", icon: Globe },
  // { key: "org_type", label: "Org type", icon: Building2 },
  { key: "campCount", label: "Campaigns", icon: Megaphone },
  { key: "pitchCount", label: "Pitches", icon: FileText },
  { key: "billing", label: "Billing", icon: Receipt },
];

interface BrandFilterGroupsProps {
  model: FilterModel;
  facets: BrandFacets | undefined;
  railOpen: boolean;
  openGroup: FilterGroupKey | null;
  onOpenGroup: (key: FilterGroupKey | null) => void;
  openMenu: string | null;
  onOpenMenu: (key: string | null) => void;
  onExpandRail: () => void;
}

/**
 * Same accordion shell as CreatorFilters — one group open at a time, each
 * group's body built from the same shared controls (FilterDropdown,
 * IconFilter, and a couple of brand-only ones below). See CreatorFilters.tsx
 * for the pattern this follows; only the groups and their fields differ.
 */
export default function BrandFilters({
  model,
  // Brand has no facet-only control (Creator's TagsControl needs the raw
  // facets for its vocabulary; every Brand control reads from `model` alone).
  facets: _facets,
  railOpen,
  openGroup,
  onOpenGroup,
  // openMenu,
  onOpenMenu,
  onExpandRail,
}: BrandFilterGroupsProps) {
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
              title={`${label}${count ? ` — ${count} applied` : ""}`}
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
                "relative flex w-full cursor-pointer items-center gap-2.25 rounded-[9px] py-2.25 text-[12.5px] font-semibold transition-colors",
                railOpen ? "px-2.25" : "justify-center overflow-visible px-0",
                open ? "bg-rp-surface2" : "hover:bg-rp-surface2/60",
                count ? "text-rp-primary" : "text-rp-text",
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
                  className={cn(
                    "size-3.25 shrink-0 opacity-70 transition-transform",
                    open && "rotate-180",
                  )}
                  strokeWidth={2.2}
                />
              )}
            </button>

            {open && (
              <div data-rp-pop="menu" className="flex flex-col gap-2.75 px-2.25 pt-1 pb-3">
                {/* {key === "platform" && (
                  <IconFilter
                    options={model.options.platform}
                    selected={model.values.platforms}
                    onChange={model.actions.setPlatforms}
                  />
                )} */}

                {/* {key === "org_type" && (
                  <FilterDropdown
                    label="Org type"
                    searchable
                    options={model.options.orgType}
                    selected={model.values.orgTypes}
                    onChange={model.actions.setOrgTypes}
                    emptyHint="No org types"
                    inline
                    {...menuProps("org_type")}
                  />
                )} */}

                {key === "campCount" && (
                  <MinCountControl
                    label="Minimum campaigns"
                    value={model.values.campMin}
                    onChange={model.actions.setMinCampaigns}
                  />
                )}

                {key === "pitchCount" && (
                  <MinCountControl
                    label="Minimum pitches"
                    value={model.values.pitchMin}
                    onChange={model.actions.setMinPitches}
                  />
                )}

                {key === "billing" && (
                  <div className="flex flex-col gap-1.8 rounded-[9px] border border-rp-border bg-rp-surface p-1.5">
                    <BillingToggle
                      label="Has a billing company"
                      checked={model.values.hasCompany}
                      onChange={model.actions.setHasCompany}
                    />
                    <BillingToggle
                      label="Has GSTIN on file"
                      checked={model.values.hasGstin}
                      onChange={model.actions.setHasGstin}
                    />
                  </div>
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
 * A single lower-bound number field — "5 or more campaigns". BrandSearchRequest
 * (both here and on the backend) only accepts min_campaigns/min_pitches, so
 * this deliberately has no "max" box: RangeControl always pairs the two, which
 * would invite typing an upper bound that the search silently ignores.
 */
function MinCountControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="shrink-0">
      <span className="mb-1 block text-[11px] font-semibold text-rp-muted">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ""))}
        placeholder="e.g. 3"
        inputMode="numeric"
        aria-label={label}
        className="w-full rounded-lg border border-rp-border bg-rp-surface2 px-2.25 py-1.75 text-xs tabular-nums outline-none focus-visible:border-rp-primary"
      />
    </div>
  );
}

function BillingToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.25 py-2 text-left text-[12.5px] transition-colors",
        checked
          ? "bg-rp-primary-soft font-semibold text-rp-primary"
          : "font-medium text-rp-text hover:bg-rp-surface2",
      )}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded border-[1.5px] transition-colors",
          checked ? "border-rp-primary bg-rp-primary" : "border-rp-box",
        )}
      >
        {checked && (
          <svg viewBox="0 0 10 10" className="size-2.5 fill-none stroke-rp-primary-fg" strokeWidth={2}>
            <path d="M1.5 5l2.3 2.3L8.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
