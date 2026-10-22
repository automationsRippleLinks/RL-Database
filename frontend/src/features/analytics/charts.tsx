import type { ReactNode } from 'react';

/* Small, dependency-free charts. Each carries its numbers in data-values so tests can compare them with the totals. */

export interface Part {
  key: string;
  label: string;
  n: number;
  color: string;
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