import type { ReactNode } from 'react';
import { compact } from './metrics';

/* Small, dependency-free charts. Each carries its numbers in data-values so tests can compare them with the totals. */

export interface Part {
  key: string;
  label: string;
  n: number;
  color: string;
}

/** One bar split into segments, width proportional to the count. */
export function SegBar({ parts, label }: { parts: Part[]; label: string }) {
  const shown = parts.filter((p) => p.n > 0);
  return (
    <div className="cc-seg-bar" role="img" aria-label={label} data-testid="segbar" data-values={parts.map((p) => p.n).join(',')}>
      {shown.map((p) => (
        <span key={p.key} style={{ flexGrow: p.n, background: p.color }} title={`${p.label}: ${p.n.toLocaleString('en-IN')}`} />
      ))}
    </div>
  );
}

/** Dot-and-label list under a chart: "● 35 Running". */
export function Legend({ parts }: { parts: Part[] }) {
  return (
    <ul className="cc-legend">
      {parts.map((p) => (
        <li key={p.key}>
          <i style={{ background: p.color }} />
          <b>{p.n.toLocaleString('en-IN')}</b> {p.label}
        </li>
      ))}
    </ul>
  );
}

const R = 52;
const C = 2 * Math.PI * R;

/** Donut. `centre` is drawn in the hole. */
export function Donut({ parts, size = 132, centre, sub, label }: { parts: Part[]; size?: number; centre: ReactNode; sub?: string; label: string }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  const shown = parts.filter((p) => p.n > 0);
  const gap = shown.length > 1 ? 2.5 : 0;
  let acc = 0;
  return (
    <div className="cc-donut" style={{ width: size, height: size }} data-testid="donut" data-values={parts.map((p) => p.n).join(',')}>
      <svg viewBox="0 0 132 132" role="img" aria-label={label}>
        <g transform="rotate(-90 66 66)" fill="none" strokeWidth="18">
          <circle cx="66" cy="66" r={R} stroke="var(--track)" />
          {total > 0 &&
            shown.map((p) => {
              const len = (p.n / total) * C;
              const el = (
                <circle key={p.key} cx="66" cy="66" r={R} stroke={p.color} strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-acc}>
                  <title>{`${p.label}: ${p.n.toLocaleString('en-IN')}`}</title>
                </circle>);
              acc += len;
              return el;
            })}
        </g>
      </svg>
      <div className="cc-donut-mid" aria-hidden="true">
        <b>{centre}</b>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

export interface RankRow {
  key: string;
  label: string;
  /** Segments of the bar, in order; their sum is the row's total. */
  parts: { n: number; color: string; label: string }[];
}

/** Ranked horizontal bars, optionally stacked. Bar length is relative to the biggest row. */
export function RankBars({ rows, empty }: { rows: RankRow[]; empty: string }) {
  if (!rows.length) return <p className="cc-empty">{empty}</p>;
  const sum = (r: RankRow) => r.parts.reduce((a, p) => a + p.n, 0);
  const max = Math.max(...rows.map(sum));
  return (
    <ul className="cc-rank" data-testid="rank" data-values={rows.map(sum).join(',')}>
      {rows.map((r) => (
        <li key={r.key} title={r.parts.filter((p) => p.n > 0).map((p) => `${p.label}: ${p.n}`).join(' · ')}>
          <span className="cc-rank-l">{r.label}</span>
          <span className="cc-rank-t">
            <span className="cc-rank-b" style={{ width: `${(sum(r) / max) * 100}%` }}>
              {r.parts.filter((p) => p.n > 0).map((p, i) => (
                <i key={i} style={{ flexGrow: p.n, background: p.color }} />
              ))}
            </span>
          </span>
          <b>{sum(r)}</b>
        </li>
      ))}
    </ul>
  );
}

/** Line chart for counts over months. */
export function LineChart({ points, label, monthLabel }: { points: { month: string; n: number }[]; label: string; monthLabel: (m: string) => string }) {
  if (!points.length) return <p className="cc-empty">No dated records.</p>;
  const W = 320, H = 170, x0 = 30, x1 = 292, top = 34, base = 138;
  const max = Math.max(1, ...points.map((p) => p.n));
  const xy = points.map((p, i) => ({
    ...p,
    x: points.length > 1 ? x0 + (i * (x1 - x0)) / (points.length - 1) : (x0 + x1) / 2,
    y: base - (p.n / max) * (base - top),
  }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cc-line" role="img" aria-label={label} data-testid="line" data-values={points.map((p) => p.n).join(',')}>
      <line x1="14" y1={base} x2="306" y2={base} stroke="var(--line)" />
      <path d={xy.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="var(--series)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {xy.map((p) => (
        <g key={p.month}>
          <circle cx={p.x} cy={p.y} r="4.5" fill="var(--surface)" stroke="var(--series)" strokeWidth="2.5">
            <title>{`${monthLabel(p.month)} ${p.month.slice(0, 4)}: ${p.n}`}</title>
          </circle>          <text x={p.x} y={p.y - 11} textAnchor="middle" className="cc-line-v">{p.n}</text>
          <text x={p.x} y="158" textAnchor="middle" className="cc-line-m">{monthLabel(p.month)}</text>
        </g>
      ))}
    </svg>
  );
}

/** Actual views (bar) against expected views (tick), one row per campaign. */
export function Bullets({ rows }: { rows: { key: string; label: string; actual: number; expected: number }[] }) {
  if (!rows.length) return <p className="cc-empty">No views logged yet.</p>;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.actual, r.expected)));
  return (
    <ul className="cc-bullets" data-testid="bullets" data-values={rows.map((r) => `${r.actual}/${r.expected}`).join(',')}>
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${r.actual.toLocaleString('en-IN')} actual views, ${r.expected.toLocaleString('en-IN')} expected`}>
          <span className="cc-rank-l">{r.label}</span>
          <span className="cc-bul-t">
            <span className="cc-bul-a" style={{ width: `${(r.actual / max) * 100}%` }} />
            <span className="cc-bul-e" style={{ left: `${(r.expected / max) * 100}%` }} />
          </span>
          <b>{compact(r.actual)}</b>
        </li>
      ))}
    </ul>
  );
}
