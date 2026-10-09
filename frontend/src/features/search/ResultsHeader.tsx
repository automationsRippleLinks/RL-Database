import { Loader2, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { formatNumber, pluralise } from '@/lib/format';

interface ResultsHeaderProps {
  total: number | undefined;
  tookMs: number | undefined;
  isFetching: boolean;
  entityLabel: string;
  sort: string;
  sortOptions: { value: string; label: string }[];
  onSortChange: (sort: string) => void;
  activeFilterCount: number;
  onResetFilters: () => void;
  onToggleFilters?: () => void;
}

export function ResultsHeader({
  total,
  tookMs,
  isFetching,
  entityLabel,
  sort,
  sortOptions,
  onSortChange,
  activeFilterCount,
  onResetFilters,
  onToggleFilters,
}: ResultsHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-semibold">
          {total === undefined ? (
            'Searching…'
          ) : (
            <>
              <span className="tnum">{formatNumber(total)}</span>{' '}
              {pluralise(total, entityLabel)}
            </>
          )}
        </h1>
        {isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        {tookMs !== undefined && !isFetching && (
          <span className="text-[11px] text-muted-foreground tnum">in {tookMs} ms</span>
        )}
        {activeFilterCount > 0 && (
          <Badge variant="primary">
            {activeFilterCount} {pluralise(activeFilterCount, 'filter')}
          </Badge>
        )}
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onResetFilters} className="h-7 px-2 text-xs">
            <RotateCcw className="size-3" />
            Reset
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {onToggleFilters && (
          <Button variant="outline" size="sm" onClick={onToggleFilters} className="lg:hidden">
            <SlidersHorizontal />
            Filters
          </Button>
        )}
        <div className="flex items-center gap-1.5">
          <span className="hidden text-xs text-muted-foreground sm:inline">Sort</span>
          <Select
            className="h-8 w-52 text-xs"
            value={sort}
            onChange={(event) => onSortChange(event.target.value)}
            aria-label="Sort results"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}
