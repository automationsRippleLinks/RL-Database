import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { PlatformMark } from '@/components/PlatformMark';
import { cn } from '@/lib/utils';
import type { Platform } from '@/types/api';

export interface DropdownOption {
  value: string;
  label: string;
  /** Draws the brand mark beside the label — the Platform list only. */
  platform?: Platform;
}

interface FilterDropdownProps {
  label: string;
  options: DropdownOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  /** Adds the in-popover search box: Brand, Category, State and City use it. */
  searchable?: boolean;
  open: boolean;
  onToggle: () => void;
  /** Shown in place of the option list when there is no vocabulary at all. */
  emptyHint?: string;
}

/**
 * One list filter in the rail.
 *
 * Deliberately NOT built on components/ui/popover: Radix portals its content to
 * the body, and the handoff requires these popovers to render inline, directly
 * beneath their field and inside the rail's own 214px, so a long City list never
 * floats over the results table. That constraint is the whole reason this is a
 * plain absolutely-positioned div — the list scrolls inside itself instead.
 *
 * Open/closed is owned by the parent because the rail allows exactly one open
 * popover; `data-rp-pop="menu"` is what the shell's outside-click listener tests.
 */
export function FilterDropdown({
  label,
  options,
  selected,
  onChange,
  searchable = false,
  open,
  onToggle,
  emptyHint,
}: FilterDropdownProps) {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!searchable || !needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query, searchable]);

  const searching = searchable && query.trim().length > 0;

  const summary =
    selected.length === 0
      ? 'Any'
      : selected.length === 1
        ? (options.find((option) => option.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;

  const toggleValue = (value: string) => {
    onChange(
      selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value],
    );
  };

  return (
    <div className="shrink-0">
      <span className="mb-1 block text-[11px] font-semibold text-rp-muted">{label}</span>

      <button
        type="button"
        onClick={() => {
          setQuery('');
          onToggle();
        }}
        title={`${label}: ${selected.length ? selected.join(', ') : 'any'}`}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-[7px] rounded-[9px] border px-[10px] py-2 text-left text-xs transition-colors',
          'bg-rp-surface2 cursor-pointer',
          open ? 'border-rp-primary' : 'border-rp-border',
          selected.length ? 'font-semibold text-rp-text' : 'font-medium text-rp-muted',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <ChevronDown
          className={cn('size-3.5 shrink-0 opacity-75 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="animate-rp-menu mt-1 overflow-hidden rounded-[10px] border border-rp-border bg-rp-surface">
          {searchable && (
            <div className="px-[7px] pt-[7px]">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}`}
                aria-label={`Search ${label.toLowerCase()}`}
                className="w-full rounded-lg border border-rp-border bg-rp-surface2 px-[9px] py-[7px] text-xs outline-none focus-visible:border-rp-primary"
              />
            </div>
          )}

          <div className="rp-scroll flex max-h-[216px] flex-col gap-px overflow-x-hidden overflow-y-auto p-1.5">
            {/* "Any" is the cleared state rather than an option, so it is checked
                when nothing is selected and hidden while searching — a search is
                a search of the vocabulary, and "Any" is not part of it. */}
            {!searching && (
              <OptionRow
                label="Any"
                checked={selected.length === 0}
                emphasis={false}
                onClick={() => onChange([])}
              />
            )}

            {visible.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                platform={option.platform}
                checked={selected.includes(option.value)}
                emphasis
                onClick={() => toggleValue(option.value)}
              />
            ))}

            {visible.length === 0 && (
              <p className="px-1 py-2 text-[11.5px] text-rp-muted">
                {options.length === 0 ? (emptyHint ?? 'Nothing to filter on yet.') : 'Nothing matches that.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OptionRow({
  label,
  platform,
  checked,
  emphasis,
  onClick,
}: {
  label: string;
  platform?: Platform;
  checked: boolean;
  /** "Any" reads as checked but is never highlighted — it is the absence of a filter. */
  emphasis: boolean;
  onClick: () => void;
}) {
  const highlighted = checked && emphasis;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center gap-[9px] rounded-lg px-[10px] py-2 text-left text-[12.5px] transition-colors',
        highlighted
          ? 'bg-rp-primary-soft font-semibold text-rp-primary'
          : 'font-medium text-rp-text hover:bg-rp-surface2',
      )}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
          checked ? 'border-rp-primary bg-rp-primary text-rp-primary-fg' : 'border-rp-box',
        )}
      >
        <Check className={cn('size-[11px]', !checked && 'opacity-0')} strokeWidth={3.4} />
      </span>
      {platform && <PlatformMark platform={platform} size={14} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
