import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Select } from './ui/select';
import { formatNumber } from '@/lib/format';

const PAGE_SIZES = [25, 50, 100, 250, 500];

interface PaginationProps {
  page: number;
  pages: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  disabled?: boolean;
}

export function Pagination({
  page,
  pages,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  disabled = false,
}: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground tnum">
        {total === 0 ? 'No results' : `${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)}`}
      </p>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Per page</span>
          <Select
            className="h-8 w-22 text-xs"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            disabled={disabled}
            aria-label="Results per page"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page - 1)}
            disabled={disabled || page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-22  text-center text-xs text-muted-foreground tnum">
            Page {page} of {Math.max(pages, 1)}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page + 1)}
            disabled={disabled || page >= pages}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

export { PAGE_SIZES };
