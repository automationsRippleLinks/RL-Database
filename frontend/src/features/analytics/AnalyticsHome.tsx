import type { creatorMetrics } from './metrics';
import type { Part } from './charts';
import { Donut, Legend } from './charts';
import { fmtN } from './creators/calculations/format';
import { compact } from '@/lib/format';
import { SECTIONS } from './sections';
import './tokens.css';
import './analytics.css';
import { CREATOR_COLOR } from './colors';

export type ViewId = 'creators' | 'brands' | 'campaigns' | 'pitches';

/** What each unbuilt section will show, for its "Coming soon" card. */
const COMING: Record<Exclude<ViewId, 'creators'>, string> = {
  brands: 'Campaigns per brand, and which brands are most active.',
  campaigns: 'Running, completed and on-hold campaigns, and what is due soon.',
  pitches: 'Pitches over time, and which ones became campaigns.',
};

/** The landing page: the live Creators card, then one "Coming soon" card per section still being built. */
export function AnalyticsHome({ creators: c, open }: { creators: ReturnType<typeof creatorMetrics>; open: (v: ViewId) => void }) {
  const creatorParts: Part[] = [
    { key: 'missing', label: 'missing at least one field', n: c.missing, color: CREATOR_COLOR.missing },
    { key: 'complete', label: 'all fields filled', n: c.complete, color: CREATOR_COLOR.complete },
  ];

  return (
    <div className="cc-root" data-testid="an-home">
      <header className="cc-top">
        <div>
          <h1 className="cc-title">Analytics</h1>
        </div>
      </header>
      <section className="cc-an-grid" aria-label="Analytics">
        <button
          type="button"
          className="cc-an-card"
          data-testid="card-creators"
          aria-label={`Open Creators analytics. ${fmtN(c.total)} creators, ${fmtN(c.missing)} missing at least one field.`}
          onClick={() => open('creators')}
        >
          <span className="cc-an-head">
            <span className="cc-an-title">CREATORS</span>
            <span className="cc-an-go" aria-hidden="true">
              Open
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </span>
          </span>
          <span className="cc-an-count" data-testid="count-creators">{fmtN(c.total)}</span>
          <span className="cc-an-body">
            <Donut parts={creatorParts} size={116} centre={compact(c.missing)} sub="missing" label={`Creators: ${c.missing} missing at least one field, ${c.complete} complete`} />
            <Legend parts={creatorParts} />
          </span>
        </button>

        {SECTIONS.filter((s) => !s.ready && s.id !== 'creators').map((s) => (
          <div key={s.id} className="cc-an-card cc-an-soon" data-testid={`card-${s.id}`}>
            <span className="cc-an-head">
              <span className="cc-an-title">{s.title.toUpperCase()}</span>
              <span className="cc-an-pill">Coming soon</span>
            </span>
            <s.icon className="cc-an-icon" aria-hidden="true" />
            <span className="cc-an-soon-t">We&apos;re working on this</span>
            <span className="cc-an-cap">{COMING[s.id as keyof typeof COMING]}</span>
          </div>
        ))}
      </section>
    </div>
  );
}