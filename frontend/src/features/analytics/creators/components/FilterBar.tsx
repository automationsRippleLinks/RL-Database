import type { Dispatch } from 'react';
import { NONE } from '../rules/config';
import type { FilterOption, FilterOptions, ScopeKey } from '../calculations/filters';
import type { Action, State } from '../state';
import { CheckIcon, ChevIcon } from './Icons';

const TITLES: Record<ScopeKey, string> = { plat: 'Platform', cat: 'Category', lang: 'Language' };
const ALL: Record<ScopeKey, string> = { plat: 'All platforms', cat: 'All categories', lang: 'All languages' };

interface Props {
  options: FilterOptions;
  state: State;
  dispatch: Dispatch<Action>;
}

export function FilterBar({ options, state, dispatch }: Props) {
  const anyFilter = state.plat.length + state.cat.length + state.lang.length > 0 || state.field !== null || state.q.trim() !== '';
  return (
    <section className="cc-filters" aria-label="Filters">
      {(['plat', 'cat', 'lang'] as const).map((g) => (
        <Dropdown key={g} group={g} options={options[g]} selected={state[g]} open={state.open === g} dispatch={dispatch} />
      ))}
      <button type="button" className="cc-lnk cc-clear" data-testid="clear-filters" disabled={!anyFilter} onClick={() => dispatch({ type: 'reset' })}>
        Clear filters
      </button>
    </section>
  );
}

interface DropdownProps {
  group: ScopeKey;
  options: FilterOption[];
  selected: string[];
  open: boolean;
  dispatch: Dispatch<Action>;
}

function Dropdown({ group, options, selected, open, dispatch }: DropdownProps) {
  const title = TITLES[group];
  // The button says what is applied: "All platforms", the one choice, or how many.
  const current =
    selected.length === 0
      ? ALL[group]
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;
  return (
    <div className="cc-dd">
      <button
        type="button"
        className={`cc-fbtn${selected.length ? ' cc-on' : ''}`}
        data-testid={`dd-${group}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => dispatch({ type: 'setOpen', group: open ? null : group })}
      >
        <span className="cc-fbtn-t">{current}</span>
        <ChevIcon />
      </button>
      {open && (
        <div className="cc-dd-panel scrollbar-thin" role="group" aria-label={title}>          <div className="cc-dd-top">
          <span>{title}</span>
          <button type="button" className="cc-lnk" disabled={!selected.length} onClick={() => dispatch({ type: 'clearGroup', group })}>
            Clear
          </button>
        </div>
          {options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                className="cc-opt"
                role="checkbox"
                aria-checked={on}
                data-testid={`opt-${group}-${o.value}`}
                onClick={() => dispatch({ type: 'toggleOption', group, value: o.value })}
              >
                <span className="cc-bx">{on ? <CheckIcon /> : null}</span>
                <span className={`cc-ol${o.value === NONE ? ' cc-none' : ''}`}>{o.label}</span>
                <span className="cc-oc">{o.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
