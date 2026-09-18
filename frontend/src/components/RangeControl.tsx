import { parseAmount } from '@/lib/format';

/**
 * Followers and Avg views. Two text inputs, not number inputs and not a slider:
 * these ranges span four orders of magnitude, and the values people have in mind
 * are typed as "25k" or "1.5m" — `type="number"` would reject both.
 *
 * The raw text is what goes in the URL, so a half-typed "1." survives the round
 * trip and the caret stays put; `parseAmount` turns it into a bound at the API
 * boundary and returns null for anything it cannot read, which reads as "no
 * bound" rather than as an error.
 */
export function RangeControl({
  label,
  min,
  max,
  onChange,
}: {
  label: string;
  min: string;
  max: string;
  onChange: (min: string, max: string) => void;
}) {
  const unreadable = (value: string) => value.trim() !== '' && parseAmount(value) === null;
  const invalid = unreadable(min) || unreadable(max);

  return (
    <div className="shrink-0">
      <span className="mb-1 block text-[11px] font-semibold text-rp-muted">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          value={min}
          onChange={(event) => onChange(event.target.value, max)}
          placeholder="Min"
          inputMode="numeric"
          aria-label={`Minimum ${label.toLowerCase()}`}
          className="min-w-0 flex-1 rounded-lg border border-rp-border bg-rp-surface2 px-[9px] py-[7px] text-xs tabular-nums outline-none focus-visible:border-rp-primary"
        />
        <span className="text-[11px] text-rp-muted">–</span>
        <input
          value={max}
          onChange={(event) => onChange(min, event.target.value)}
          placeholder="Max"
          inputMode="numeric"
          aria-label={`Maximum ${label.toLowerCase()}`}
          className="min-w-0 flex-1 rounded-lg border border-rp-border bg-rp-surface2 px-[9px] py-[7px] text-xs tabular-nums outline-none focus-visible:border-rp-primary"
        />
      </div>
      <span className="mt-1 block text-[10px] text-rp-muted">
        {invalid ? 'Use a number like 25000, 25k or 1.5m' : 'e.g. 25000, 25k or 1.5m'}
      </span>
    </div>
  );
}
