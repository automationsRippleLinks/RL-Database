import type { ReactNode } from 'react';
import type { brandMetrics, campaignMetrics, creatorMetrics, pitchMetrics } from './metrics';
import type { Part } from './charts';
import { Donut, Legend, RankBars, SegBar } from './charts';
import { fmtN } from './creators/calculations/format';
import './tokens.css';
import './analytics.css';
import { STATUS_COLOR, PITCH_COLOR, CREATOR_COLOR, BRAND_COLOR } from './colors';

export type ViewId = 'creators' | 'brands' | 'campaigns' | 'pitches';
type Metrics = {
  creators: ReturnType<typeof creatorMetrics>;
  brands: ReturnType<typeof brandMetrics>;
  campaigns: ReturnType<typeof campaignMetrics>;
  pitches: ReturnType<typeof pitchMetrics>;
};

function Card({ id, title, open, summary, children }: { id: ViewId; title: string; open: (v: ViewId) => void; summary: string; children: ReactNode }) {
  return (
    <button type="button" className="cc-an-card" data-testid={`card-${id}`} aria-label={`Open ${title} analytics. ${summary}`} onClick={() => open(id)}>
      <span className="cc-an-head">
        <span className="cc-an-title">{title.toUpperCase()}</span>
        <span className="cc-an-go" aria-hidden="true">
          Open
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </span>
      </span>
      {children}
    </button>
  );
}

/** The landing page: exactly four clickable cards. Totals live inside the cards. */
export function AnalyticsHome({ m, open }: { m: Metrics; open: (v: ViewId) => void }) {
  const c = m.creators;
  const creatorParts: Part[] = [
    { key: 'missing', label: 'missing at least one field', n: c.missing, color: CREATOR_COLOR.missing },
    { key: 'complete', label: 'all fields filled', n: c.complete, color: CREATOR_COLOR.complete },
  ];
  const top3 = m.brands.ranked.slice(0, 3);
  const k = m.campaigns;
  const statusParts: Part[] = k.byStatus.map((s) => ({ key: s.status, label: s.label.toLowerCase(), n: s.n, color: STATUS_COLOR[s.status] }));
  const p = m.pitches;
  const pitchParts: Part[] = [
    { key: 'linked', label: 'linked to a campaign', n: p.linked, color: PITCH_COLOR.linked },
    { key: 'none', label: 'no campaign yet', n: p.notLinked, color: PITCH_COLOR.none },
  ];

  return (
    <div className="cc-root" data-testid="an-home">
      <header className="cc-top">
        <div>
          <h1 className="cc-title">Analytics</h1>
        </div>
      </header>
      <section className="cc-an-grid" aria-label="Analytics">
        <Card id="creators" title="Creators" open={open} summary={`${fmtN(c.total)} creators, ${fmtN(c.missing)} missing at least one field.`}>
          <span className="cc-an-count" data-testid="count-creators">{fmtN(c.total)}</span>
          <span className="cc-an-body">
            <Donut parts={creatorParts} size={116} centre={fmtN(c.missing)} sub="missing" label={`Creators: ${c.missing} missing at least one field, ${c.complete} complete`} />
            <Legend parts={creatorParts} />
          </span>
        </Card>

        <Card id="brands" title="Brands" open={open} summary={`${fmtN(m.brands.total)} brands.`}>
          <span className="cc-an-count" data-testid="count-brands">{fmtN(m.brands.total)}</span>
          <span className="cc-an-cap">Campaign activity · top 3 by campaigns</span>
          <RankBars rows={top3.map((b) => ({ key: String(b.id), label: b.name, parts: [{ n: b.campaigns, color: BRAND_COLOR, label: 'Campaigns' }] }))} empty="No campaigns yet." />
        </Card>

        <Card id="campaigns" title="Campaigns" open={open} summary={`${fmtN(k.running)} running of ${fmtN(k.total)} campaigns.`}>
          <span className="cc-an-count" data-testid="count-campaigns">
            {fmtN(k.running)}
            <small>running</small>
          </span>
          <span className="cc-an-cap">of {fmtN(k.total)} campaigns</span>
          <SegBar parts={statusParts} label={`Campaign status: ${statusParts.map((s) => `${s.n} ${s.label}`).join(', ')}`} />
          <Legend parts={statusParts} />
        </Card>

        <Card id="pitches" title="Pitches" open={open} summary={`${fmtN(p.total)} pitches.`}>
          <span className="cc-an-count" data-testid="count-pitches">{fmtN(p.total)}</span>
          <span className="cc-an-cap" title="Pitches have no status in the database. This shows whether a campaign points to the pitch.">Campaign link</span>
          <SegBar parts={pitchParts} label={`Pitches: ${p.linked} linked to a campaign, ${p.notLinked} with no campaign yet`} />
          <Legend parts={pitchParts} />
        </Card>
      </section>
    </div>
  );
}
