import { Fragment, type CSSProperties, type Dispatch } from 'react';
import { FIELDS, FIELD_BY_KEY, PLATFORM_LABEL } from '../rules/config';
import { niceScale } from '../calculations/scale';
import { fmtN } from '../calculations/format';
import type { Action, State } from '../state';
import type { CreatorSummary } from '@/types/api';
import { BarChart, type BarItem } from './BarChart';
import { ChartPanel, EmptyChart } from './ChartPanel';
import { PlatformIcon } from './Icons';

/** After a chart click, scroll down to the table so the filtered list is in view. */
const toTable = () => document.getElementById('cc-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

interface Props {
  summary: CreatorSummary;
  state: State;
  dispatch: Dispatch<Action>;
}

export function Charts(props: Props) {
  return (
    <section className="cc-charts">
      <FieldChart {...props} />
      <HeatmapChart {...props} />
    </section>
  );
}

/* ---------- one bar per field: how many creators are missing it ---------- */
function FieldChart({ summary, state, dispatch }: Props) {
  const n = summary.totals.total;
  const stats = summary.fields;
  const axisMax = Math.max(0, ...stats.map((s) => s.missing));
  const axis = niceScale(axisMax);

  const items: BarItem[] = [...stats]
    .sort((a, b) => b.missing - a.missing)
    .map((s) => {
      const label = FIELD_BY_KEY[s.key].label;
      return {
        key: s.key,
        label,
        p: s.missing / axis.top,
        pressed: state.field === s.key,
        testId: `bar-${s.key}`,
        value: <b>{fmtN(s.missing)}</b>,
        tip: `${fmtN(s.missing)} of ${fmtN(s.applicable)} creators are missing ${label.toLowerCase()}. Click to list them.`,
        onClick: () => {
          dispatch({ type: 'toggleField', field: s.key });
          if (state.field !== s.key) toTable();
        },
      };
    });

  return (
    <ChartPanel title="Missing information">
      {!n ? (
        <EmptyChart message="No creators match these filters." />
      ) : axisMax === 0 ? (
        <EmptyChart message="No creators are missing any information with these filters." />
      ) : (
        <BarChart top={axis.top} ticks={[]} hasSelection={state.field !== null} lab={110} gut={56} groups={[{ items }]} />
      )}
    </ChartPanel>
  );
}

/* ---------- heatmap: platform (rows) x field (columns). The number is a count; the shade is the share of that platform's creators ---------- */
const SHADES = [0, 0.2, 0.4, 0.6, 0.8, 1];

function HeatmapChart({ summary, state, dispatch }: Props) {
  // The summary ignores the platform filter on purpose, so every platform row stays visible while one is selected.
  const rows = summary.platforms
    .filter((p) => p.total > 0)
    .map((p) => ({ p, label: PLATFORM_LABEL[p.platform] ?? p.platform }));
  const share = (applicable: number, missing: number) => (applicable ? missing / applicable : 0);
  const maxShare = Math.max(0.0001, ...rows.flatMap((r) => FIELDS.map((f) => share(r.p.cells[f.key]?.applicable ?? 0, r.p.cells[f.key]?.missing ?? 0))));

  return (
    <ChartPanel title="Missing data by platform">
      {!rows.length ? (
        <EmptyChart message="No creators match these filters." />
      ) : (
        <>
          <div className="cc-heat" style={{ gridTemplateColumns: `56px repeat(${FIELDS.length}, minmax(48px, 1fr))` }} data-testid="heatmap">
            <span />
            {FIELDS.map((f) => (
              <span key={f.key} className="cc-heat-h">{f.label}</span>
            ))}
            {rows.map(({ p, label }) => {
              const rowOn = state.plat.length === 1 && state.plat[0] === p.platform && !state.field;
              return (
                <Fragment key={p.platform}>
                  <button
                    type="button"
                    className={`cc-heat-r${rowOn ? ' cc-sel' : ''}`}
                    aria-pressed={rowOn}
                    title={`${label} · ${fmtN(p.total)} creators. Click to list them.`}
                    data-testid={`heat-row-${p.platform}`}
                    onClick={() => {
                      dispatch({ type: 'togglePlatform', plat: p.platform });
                      if (!rowOn) toTable();
                    }}
                  >
                    <PlatformIcon platform={p.platform} label={label} />
                  </button>
                  {FIELDS.map((f) => {
                    const cell = p.cells[f.key] ?? { applicable: 0, missing: 0 };
                    if (!cell.applicable) return <span key={f.key} className="cc-heat-na" title={`${f.label} does not apply to ${label} creators.`} />;
                    const on = state.field === f.key && state.plat.length === 1 && state.plat[0] === p.platform;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        className={`cc-heat-c${on ? ' cc-sel' : ''}`}
                        style={{ '--h': (share(cell.applicable, cell.missing) / maxShare).toFixed(3) } as CSSProperties}
                        data-testid={`heat-${f.key}-${p.platform}`}
                        data-missing={cell.missing}
                        aria-pressed={on}
                        title={`${label} · ${f.label} missing: ${fmtN(cell.missing)} of ${fmtN(cell.applicable)} creators (${Math.round(share(cell.applicable, cell.missing) * 100)}%). Click to list them.`}
                        onClick={() => {
                          dispatch({ type: 'pickCell', field: f.key, plat: p.platform });
                          if (!on) toTable();
                        }}
                      >
                        {fmtN(cell.missing)}
                      </button>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
          <div className="cc-heat-key" aria-hidden="true">
            <span>Fewer missing</span>
            {SHADES.map((h) => (
              <i key={h} style={{ '--h': h } as CSSProperties} />
            ))}
            <span>More missing</span>
          </div>
        </>
      )}
    </ChartPanel>
  );
}
