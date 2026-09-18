import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from './UI/button';
import { Input } from './UI/input';
import { Popover, PopoverContent, PopoverTrigger } from './UI/popover';
import { cn } from '@/lib/utils';

export interface FacetOption {
  value: string;
  label: string;
  /** Secondary text, e.g. the follower band next to a tier. */
  hint?: string;
}

interface FacetMultiSelectProps {
  label: string;
  options: FacetOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  /** Long vocabularies (cities, managers, brands) get an inline filter box. */
  searchable?: boolean;
  disabled?: boolean;
}

export function FacetMultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = 'Any',
  searchable,
  disabled = false,
}: FacetMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');

  // Show the filter box automatically once the list is long enough to need one.
  const showFilter = searchable ?? options.length > 12;

  const visible = useMemo(() => {
    if (!filter.trim()) return options;
    const needle = filter.toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, filter]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const summary = () => {
    if (!selected.length) return placeholder;
    if (selected.length === 1) {
      return options.find((option) => option.value === selected[0])?.label ?? selected[0];
    }
    return `${selected.length} selected`;
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3" />
            Clear
          </button>
        )}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled || options.length === 0}
            className={cn(
              'h-9 w-full justify-between px-3 font-normal',
              !selected.length && 'text-muted-foreground',
            )}
          >
            <span className="truncate">{summary()}</span>
            <ChevronsUpDown className="ml-2 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-var(--radix-popover-trigger-width) min-w-56 p-0">
          {showFilter && (
            <div className="border-b border-border p-1.5">
              <Input
                autoFocus
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={`Filter ${label.toLowerCase()}…`}
                className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto p-1 scrollbar-thin">
            {visible.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches</p>
            ) : (
              visible.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggle(option.value)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      isSelected && 'text-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-sm border border-input',
                        isSelected && 'border-primary bg-primary text-primary-foreground',
                      )}
                    >
                      {isSelected && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 truncate">{option.label}</span>
                    {option.hint && (
                      <span className="shrink-0 text-[11px] text-muted-foreground tnum">{option.hint}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
