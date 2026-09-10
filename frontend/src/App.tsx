import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import { LoadingState } from '@/components/states';
import { cn } from '@/lib/utils';
import { AppRail } from '@/features/pulse/AppRail';
import { DataRail } from '@/features/pulse/DataRail';
import { PulseHeader } from '@/features/pulse/PulseHeader';
import { ShellStateProvider } from '@/features/pulse/shell-state';
import { useCampaignFacets, useCreatorFacets } from '@/features/search/queries';

/**
 * The Ripple Pulse shell: a fixed header over App rail | Data rail | content.
 *
 * The page itself never scrolls — `h-screen overflow-hidden` — and each region
 * owns its own scrolling. That is what lets the results table keep a sticky
 * header at 250 rows per page and the rail keep a pinned Collapse button, both
 * of which would drift off-screen under a single document scroll.
 */
export function App() {
  const location = useLocation();
  const isSearch = location.pathname.startsWith('/search');

  return (
    <ShellStateProvider>
      <ToastProvider>
        <div className="flex h-full flex-col overflow-hidden bg-rp-bg text-rp-text">
          <PulseHeader />

          <div className="flex min-h-0 flex-1">
            <AppRail />
            {/* The data rail belongs to search. Ingest and Taxonomy are their
                own destinations and take the full width. */}
            {isSearch && <SearchRail />}

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <Suspense fallback={<LoadingState />}>
                {isSearch ? (
                  <Outlet />
                ) : (
                  // Ingest and Taxonomy were written as ordinary scrolling pages,
                  // so they get the page padding and scroll container the old
                  // <main> used to give them.
                  <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-5')}>
                    <div className="mx-auto max-w-[1600px]">
                      <Outlet />
                    </div>
                  </div>
                )}
              </Suspense>
            </div>
          </div>
        </div>
      </ToastProvider>
    </ShellStateProvider>
  );
}

/**
 * Split out so the two facet queries are only mounted on search routes.
 *
 * Both are cached hard (10 minutes; filter vocabularies only change on ingest),
 * and the creator facets are the same query the results page runs — so this
 * shares one subscription with it rather than adding a request. The campaign
 * facets are here for the brand list the "Worked with" filter offers.
 */
function SearchRail() {
  const creatorFacets = useCreatorFacets();
  const campaignFacets = useCampaignFacets();

  return <DataRail facets={creatorFacets.data} brands={campaignFacets.data?.brands} />;
}
