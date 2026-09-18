import { Input } from './UI/input';

interface DateRangeFilterProps {
  label: string;
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
}

export function DateRangeFilter({ label, from, to, onChange }: DateRangeFilterProps) {
  const parse = (raw: string): string | null => (raw.trim() === '' ? null : raw);

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="date"
          value={from ?? ''}
          onChange={(event) => onChange(parse(event.target.value), to)}
          aria-label={`${label} from`}
        />
        <Input
          type="date"
          value={to ?? ''}
          onChange={(event) => onChange(from, parse(event.target.value))}
          aria-label={`${label} to`}
        />
      </div>
    </div>
  );
}
