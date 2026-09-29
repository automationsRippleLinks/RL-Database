import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import { LoadingState } from '@/components/states';
import { cn } from '@/lib/utils';
import { AppRail } from '@/components/AppRail';
import { DataRail } from '@/components/DataRail';
import { PulseHeader } from '@/features/pulse/PulseHeader';
import { ShellStateProvider } from '@/store/shell-state';

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
  const showDataRail =
    isSearch && location.pathname.replace(/\/+$/, '') !== '/search';

  return (
    <ShellStateProvider>
      <ToastProvider>
        <div className="flex h-full flex-col overflow-hidden bg-rp-bg text-rp-text">
          <PulseHeader />


          <div className="flex min-h-0 flex-1">
            <AppRail />
            {/* The data rail belongs to search. Ingest and Taxonomy are their
                own destinations and take the full width. */}
          
            {showDataRail && <DataRail />}

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <Suspense fallback={<LoadingState />}>
                {isSearch ? (
                  <Outlet /> // load search page
                ) : (
                  <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-5')}>
                    <div className="mx-auto max-w-[1600px]">
                      <Outlet /> {/*load ingest or taxonomy page */}
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
