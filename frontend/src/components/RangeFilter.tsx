import { Input } from './ui/input';
import { humaniseCount } from '@/lib/format';

interface RangeFilterProps {
  label: string;
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
  step?: number;
}

/**
 * Two bare number inputs rather than a slider: these ranges span four orders of
 * magnitude (a nano creator to a mega one), which no linear slider handles well,
 * and people searching this database usually have an exact threshold in mind.
 */
export function RangeFilter({ label, min, max, onChange, step = 1000 }: RangeFilterProps) {
  const parse = (raw: string): number | null => {
    if (raw.trim() === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {(min !== null || max !== null) && (
          <span className="text-[11px] text-muted-foreground tnum">
            {min !== null ? humaniseCount(min) : '0'} – {max !== null ? humaniseCount(max) : '∞'}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          min={0}
          step={step}
          value={min ?? ''}
          onChange={(event) => onChange(parse(event.target.value), max)}
          placeholder="Min"
          className="tnum"
          aria-label={`Minimum ${label}`}
        />
        <Input
          type="number"
          min={0}
          step={step}
          value={max ?? ''}
          onChange={(event) => onChange(min, parse(event.target.value))}
          placeholder="Max"
          className="tnum"
          aria-label={`Maximum ${label}`}
        />
      </div>
    </div>
  );
}
