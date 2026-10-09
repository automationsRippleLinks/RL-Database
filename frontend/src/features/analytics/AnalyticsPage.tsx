import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnalyticsHome, type ViewId } from './AnalyticsHome';
import { brandMetrics, campaignMetrics, creatorMetrics, pitchMetrics } from './metrics';
import { buildViews } from './entities/build';
import { loadProvisional } from './entities/loadProvisional';
import type { ProvisionalData } from './entities/types';
import { useCreatorSummary } from './creators/data/queries';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; extra: ProvisionalData };

/**
 * /analytics: the four-card home. The Creators card is live (the same summary the Creators page uses, so the card
 * and the page cannot disagree). Brands, Campaigns and Pitches are still sample data (entities/loadProvisional.ts).
 */
export function AnalyticsPage() {
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const summary = useCreatorSummary({ plat: [], cat: [], lang: [] });

  useEffect(() => {
    let live = true;
    loadProvisional().then(
      (extra) => live && setLoad({ status: 'ready', extra }),
      (e: unknown) => live && setLoad({ status: 'error', message: e instanceof Error ? e.message : 'Could not load the data.' }),
    );
    return () => {
      live = false;
    };
  }, []);

  const m = useMemo(() => {
    if (load.status !== 'ready' || !summary.data) return null;
    const views = buildViews(load.extra);
    return {
      creators: creatorMetrics(summary.data),
      brands: brandMetrics(views.brands, views.campaigns),
      campaigns: campaignMetrics(views.campaigns, load.extra),
      pitches: pitchMetrics(views.pitches),
    };
  }, [load, summary.data]);

  if (load.status === 'loading' || (summary.isPending && load.status === 'ready')) return <p className="py-20 text-center text-rp-muted">Loading…</p>;
  if (load.status === 'error' || summary.isError || !m) {
    const why = load.status === 'error' ? load.message : summary.isError ? 'the creator numbers failed to load' : null;
    return <p role="alert" className="py-20 text-center text-rp-danger">Could not load the data{why ? `: ${why}` : '.'}</p>;
  }
  return (
    <div>
      <p className="cc-root cc-demo" data-testid="demo-banner">
        <span>
          <b>Creators is live.</b> Brands, Campaigns and Pitches still show sample data until they are connected.
        </span>
      </p>
      <AnalyticsHome m={m} open={(v: ViewId) => navigate(`/analytics/${v}`)} />
    </div>
  );
}
