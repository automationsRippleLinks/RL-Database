import CreatorFilters from "./CreatorFilters";
import CampaignFilters from "./CampaignFilters";
import BrandFilters from "./BrandFilters";
import PitchFilters from "./PitchFilters";
import { useCreatorFilterModel } from "@/hooks/filterModels/useCreatorFilterModel";
import { useBrandFilterModel } from "@/hooks/filterModels/useBrandFilterModel";
import {
  useCreatorFacets,
  useBrandFacets,
  useCampaignFacets,
  usePitchFacets,
} from "@/features/search/queries";
import { cn } from "@/lib/utils";
import { type ShellState } from "@/store/shell-state";

export default function FilterSection({
  shellState,
  scope,
}: {
  shellState: ShellState;
  scope: string;
}) {
  switch (scope) {
    case "creators":
      return <CreatorFilterSection shellState={shellState} />;
    case "brands":
      return <BrandFilterSection shellState={shellState} />;
    // case "campaigns":
    //   return <CampaignFilterSection shellState={shellState} />;
    // case "pitches":
    //   return <PitchFilterSection shellState={shellState} />;
    default:
      return null;
  }
}

function CreatorFilterSection({ shellState }: { shellState: ShellState }) {
  const facets = useCreatorFacets();
  const model = useCreatorFilterModel(facets.data);

  return (
    <FilterSectionShell
      shellState={shellState}
      facets={facets}
      model={model}
      Component={CreatorFilters}
    />
  );
}

function BrandFilterSection({ shellState }: { shellState: ShellState }) {
  const facets = useBrandFacets();
  const model = useBrandFilterModel(facets.data);

  return (
    <FilterSectionShell
      shellState={shellState}
      facets={facets}
      model={model}
      Component={BrandFilters}
    />
  );
}

// function CampaignFilterSection({ shellState }: { shellState: ShellState }) {
//   const facets = useCampaignFacets();
//   const model = useCamapignFilterModel(facets.data); //define

//   return (
//     <FilterSectionShell
//       shellState={shellState}
//       facets={facets}
//       model={model}
//       Component={CampaignFilters}
//     />
//   );
// }

// function PitchFilterSection({ shellState }: { shellState: ShellState }) {
//   const facets = usePitchFacets();
//   const model = usePitchFilterModel(facets.data);

//   return (
//     <FilterSectionShell
//       shellState={shellState}
//       facets={facets}
//       model={model}
//       Component={PitchFilters}
//     />
//   );
// }

function FilterSectionShell({ shellState, facets, model, Component }) {
  return (
    <div className="mt-2.5 flex min-h-0 flex-1 flex-col border-t border-rp-border">
      <div
        className={cn(
          "flex shrink-0 items-center justify-between overflow-hidden px-2.25",
          shellState.railOpen
            ? "h-8.5 opacity-100 transition-[opacity,height] delay-50 duration-200 ease-out"
            : "h-2.25 opacity-0 transition-[opacity,height] duration-200 ease-out",
        )}
      >
        <span className="text-[10.5px] font-bold tracking-[0.06em] text-rp-muted uppercase">
          Filters
        </span>
        {model.totalApplied > 0 && (
          <button
            type="button"
            onClick={() => model.actions.clearAll()}
            className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] font-bold text-rp-primary hover:bg-rp-surface2"
          >
            Clear all
          </button>
        )}
      </div>

      {!shellState.railOpen && model.totalApplied > 0 && (
        <div className="mx-1.75 mt-1.75 mb-0.5 flex cursor-pointer items-center justify-center gap-1 rounded-lg bg-rp-primary-soft py-1.25 text-[10.5px] font-bold text-rp-primary">
          {model.totalApplied}
        </div>
      )}

      <div className="rp-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto px-1.75 pt-0.5 pb-2.5">
        <Component
          model={model}
          facets={facets.data}
          railOpen={shellState.railOpen}
          openGroup={shellState.openGroup}
          onOpenGroup={shellState.setOpenGroup}
          openMenu={shellState.openMenu}
          onOpenMenu={shellState.setOpenMenu}
          onExpandRail={shellState.expandRail}
        />
      </div>
    </div>
  );
}
