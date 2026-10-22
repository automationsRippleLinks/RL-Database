import { useEffect, useRef, useState } from 'react';
import './SummaryTiles.css';

interface Props {
  /** Every creator, active and inactive. */
  total: number;
  active: number;
  inactive: number;
  /** Counted on ACTIVE creators only. */
  missing: number;
  complete: number;
  /** Optional: shows the "Review incomplete profiles" button. */
  onReview?: () => void;
  /** Optional: clicking Active / Inactive switches the page's active filter. */
  onPickActive?: (value: 'active' | 'inactive') => void;
}

const fmt = (n: number) => n.toLocaleString('en-US');
const share = (part: number, whole: number) => (whole > 0 ? Math.min(100, (part / whole) * 100) : 0);
const one = (n: number) => `${n.toFixed(1)}%`;

/** Counts up to `target`, and again whenever it changes. Skips the motion if the user asked for less. */
function useCountUp(target: number, ms = 900) {
  const [val, setVal] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setVal(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const v = Math.round(a + (target - a) * (1 - Math.pow(1 - k, 3)));
      setVal(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

/** false on the first paint, true right after, so CSS transitions play from empty to full. */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setM(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return m;
}

const R = 70; // donut radius in a 200 x 200 box
const CIRC = 2 * Math.PI * R;

type Tone = 'slate' | 'green' | 'grey' | 'purple';

/**
 * Creator overview.
 *  - Total, Active and Inactive are counted over every creator.
 *  - Complete and Missing are counted over ACTIVE creators only, so they add up to Active.
 */
export function SummaryTiles({ total, active, inactive, missing, complete, onReview, onPickActive }: Props) {
  const ready = useMounted();
  const activePct = share(active, total);
  const missPct = share(missing, active);
  const donut = ready ? (activePct / 100) * CIRC : 0;
  const activeShown = useCountUp(active);
  const missingShown = useCountUp(missing);

  return (
    <section className="np" aria-label="Creator overview" data-testid="summary-tiles">
      <div className="np-kpis">
        <Kpi label="Total creators" value={total} pct={100} tone="slate" note="active + inactive" testId="tile-total" />
        <Kpi label="Active creators" value={active} pct={activePct} tone="green" note={`${one(activePct)} of all creators`} testId="tile-active" onClick={onPickActive && (() => onPickActive('active'))} />
        <Kpi label="Inactive creators" value={inactive} pct={share(inactive, total)} tone="grey" note={`${one(share(inactive, total))} of all creators`} testId="tile-inactive" onClick={onPickActive && (() => onPickActive('inactive'))} />
        <Kpi label="Complete profiles" value={complete} pct={share(complete, active)} tone="purple" note={`${one(share(complete, active))} of active creators`} testId="tile-complete" />
      </div>

      <div className="np-two">
        <div className="np-panel" data-testid="tile-activity">
          <h3 className="np-h">Creator activity</h3>
          <p className="np-sub">Active status across the full creator network</p>
          <div className="np-act">
            <div className="np-donut">
              <svg viewBox="0 0 200 200" role="img" aria-label={`${one(activePct)} of creators are active`}>
                <circle cx="100" cy="100" r={R} className="np-d-track" />
                <circle cx="100" cy="100" r={R} className="np-d-arc" strokeDasharray={`${donut} ${CIRC - donut}`} transform="rotate(-90 100 100)" />
              </svg>
              <div className="np-donut-in">
                <b>{one(activePct)}</b>
                <span>active</span>
              </div>
            </div>
            <ul className="np-legend">
              <li>
                <i className="np-dot np-dot-green" />
                <span>Active creators</span>
                <b>{fmt(activeShown)}</b>
                <em>{one(activePct)}</em>
              </li>
              <li>
                <i className="np-dot np-dot-grey" />
                <span>Inactive creators</span>
                <b>{fmt(inactive)}</b>
                <em>{one(share(inactive, total))}</em>
              </li>
            </ul>
          </div>
        </div>

        <div className="np-panel np-attn" data-testid="tile-missing">
          <div className="np-eyebrow">Needs attention</div>
          <h3 className="np-h">Profile completeness</h3>
          <div className="np-big">
            <b>{fmt(missingShown)}</b>
            <span>active creators have missing information</span>
          </div>
          <div className="np-split" aria-hidden="true">
            <span className="np-split-ok" style={{ width: ready ? `${100 - missPct}%` : '0%' }} />
            <span className="np-split-miss" style={{ width: ready ? `${missPct}%` : '0%' }} />
          </div>
          <div className="np-keys">
            <span><i className="np-dot np-dot-purple" />{one(100 - missPct)} complete</span>
            <span><i className="np-dot np-dot-amber" />{one(missPct)} incomplete</span>
          </div>
          {onReview && (
            <button type="button" className="np-btn" onClick={onReview}>
              Review incomplete profiles <span aria-hidden="true">›</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Kpi({ label, value, pct, tone, note, testId, onClick }: { label: string; value: number; pct: number; tone: Tone; note: string; testId: string; onClick?: () => void }) {
  const ready = useMounted();
  const shown = useCountUp(value);
  const body = (
    <>
      <div className="np-l">{label}</div>
      <div className="np-n">{fmt(shown)}</div>
      <div className="np-track">
        <span className={`np-fill np-fill-${tone}`} style={{ width: ready ? `${pct}%` : '0%' }} />
      </div>
      <div className="np-s">{note}</div>
    </>
  );
  return onClick ? (
    <button type="button" className="np-card np-click" data-testid={testId} onClick={onClick} title={`Show ${label.toLowerCase()}`}>
      {body}
    </button>
  ) : (
    <div className="np-card" data-testid={testId}>
      {body}
    </div>
  );
}