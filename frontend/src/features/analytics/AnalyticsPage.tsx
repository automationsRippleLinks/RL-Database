import { useNavigate } from 'react-router-dom';
import { AnalyticsHome, type ViewId } from './AnalyticsHome';
import { creatorMetrics } from './metrics';
import { useCreatorSummary } from './creators/data/queries';

/**
 * /analytics: the four-card home. The Creators card is live (the same summary the Creators page uses, so the card
 * and the page cannot disagree). Brands, Campaigns and Pitches show "Coming soon" until their pages are built.
 */
export function AnalyticsPage() {
  const navigate = useNavigate();
  const summary = useCreatorSummary({ plat: [], cat: [], lang: [] });

  if (summary.isPending) return <p className="py-20 text-center text-rp-muted">Loading…</p>;
  if (summary.isError) {
    return <p role="alert" className="py-20 text-center text-rp-danger">Could not load the data: the creator numbers failed to load</p>;
  }
  return <AnalyticsHome creators={creatorMetrics(summary.data)} open={(v: ViewId) => navigate(`/analytics/${v}`)} />;
}