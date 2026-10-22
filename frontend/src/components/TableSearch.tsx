import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

// match on a creators name or @username. an empty search matches everything .

export function matchesCreator(
    row: { name: string; username?: string | null },
    query: string,
): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
        row.name.toLowerCase().includes(q) ||
        (row.username ?? '').toLowerCase().includes(q)
    );
}

export function TableSearch({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Screen-reader name. Falls back to the placeholder. */
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative w-70 max-w-full', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.75 -translate-y-1/2 text-rp-muted" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        autoComplete="off"
        className="h-9 w-full rounded-lg border border-rp-border bg-rp-surface pr-8 pl-8 text-sm outline-none focus-visible:border-rp-primary"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 flex -translate-y-1/2 cursor-pointer rounded p-0.5 text-rp-muted hover:text-rp-text"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}