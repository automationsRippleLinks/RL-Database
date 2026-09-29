import { DateRangePicker } from 'rsuite';

function parseISO(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function DateRangeControl({
  label,
  from,
  to,
  onChange,

}: {
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const value: [Date, Date] | null =
    from && to ? [parseISO(from), parseISO(to)] : null;

  return (
    <div className="shrink-0">
      <span className="mb-1 block text-[11px] font-semibold text-rp-muted">
        {label}
      </span>

      <DateRangePicker
        block
        value={value}
        onChange={(dates) => {
          if (!dates) {
            onChange('', '');
            return;
          }
          onChange(toISO(dates[0]), toISO(dates[1]));
        }} format="dd-MM-yy"
        character=" to "
        placeholder="From - To"
        size="sm"
        editable={false}
        placement="bottomStart"
        popupClassName="rp-compact-date-range"

        container={() => document.body}
        popupStyle={{ zIndex: 9999 }}
        responsive={false}
        ranges={[]}
      />
    </div>
  );
}