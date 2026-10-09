import { Fragment, type CSSProperties, type ReactNode } from 'react';

export interface BarItem {
  key: string;
  label: string;
  sub?: string;
  /** Bar length as a fraction of the axis, 0 to 1. */
  p: number;
  pressed: boolean;
  value: ReactNode;
  tip: string;
  onClick: () => void;
  testId?: string;
}
export interface BarGroup {
  title?: string;
  note?: string;
  items: BarItem[];
}

interface Props {
  groups: BarGroup[];
  /** Axis maximum, in the same units as `ticks`. */
  top: number;
  ticks: number[];
  tickLabel?: (v: number) => string;
  hasSelection: boolean;
  /** Width of the label column and of the gutter reserved for value labels, in px. */
  lab?: number;
  gut?: number;
}

/** Horizontal bar chart: one series colour, hairline gridlines, direct value labels, whole row is the click target. */
export function BarChart({ groups, top, ticks, tickLabel = String, hasSelection, lab = 116, gut = 108 }: Props) {
  const pos = (v: number) => `calc(var(--lab) + (100% - var(--lab) - var(--gut)) * ${v / top})`;
  return (
    <div className={`cc-fc${hasSelection ? ' cc-has-sel' : ''}`} style={{ '--lab': `${lab}px`, '--gut': `${gut}px` } as CSSProperties}>
      {ticks.map((v) => (
        <span key={`g${v}`} className="cc-gl" style={{ left: pos(v) }} />
      ))}
      {groups.map((g, gi) => (
        <Fragment key={g.title ?? gi}>
          {g.title && (
            <div className="cc-fg">
              {g.title}
              <span>{g.note}</span>
            </div>
          )}
          {g.items.map((it) => (
            <button
              key={it.key}
              type="button"
              className="cc-fr"
              data-testid={it.testId}
              title={it.tip}
              aria-pressed={it.pressed}
              style={{ '--p': it.p.toFixed(4) } as CSSProperties}
              onClick={it.onClick}
            >
              <span className="cc-fr-l">
                {it.label}
                {it.sub ? <small>{it.sub}</small> : null}
              </span>
              <span className="cc-fr-p">
                <span className="cc-fr-b" />
                <span className="cc-fr-v">{it.value}</span>
              </span>
            </button>
          ))}
        </Fragment>
      ))}
      {ticks.map((v) => (
        <span key={`t${v}`} className="cc-gt" style={{ left: pos(v) }}>
          {tickLabel(v)}
        </span>
      ))}
    </div>
  );
}
