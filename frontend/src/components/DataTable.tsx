import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrapper } from './ui/table';
import { Skeleton } from './ui/skeleton';

export interface Column<Row> {
  /** Stable key, also used as the React key for cells. */
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Right-align and use tabular figures — for anything compared down a column. */
  numeric?: boolean;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  /**
   * True while a fetch is in flight but previous rows are still on screen.
   * The table dims instead of blanking, so typing doesn't cause a flash of empty.
   */
  isFetching?: boolean;
  /** True only on the very first load, when there is nothing to keep showing. */
  isLoading?: boolean;
  emptyState?: ReactNode;
  maxHeightClass?: string;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isFetching = false,
  isLoading = false,
  emptyState,
  // maxHeightClass = 'max-h-[calc(100vh-19rem)]',
  maxHeightClass = 'flex-1 min-h-0',
}: DataTableProps<Row>) {
  if (isLoading) {
    return (
      <TableWrapper className={maxHeightClass}>
        <div className="space-y-2 p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </TableWrapper>
    );
  }

  if (!rows.length) {
    return <TableWrapper className="p-0">{emptyState}</TableWrapper>;
  }

  return (
    <TableWrapper className={maxHeightClass}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.id}
                className={cn(column.numeric && 'text-right', column.headerClassName)}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className={cn('transition-opacity', isFetching && 'opacity-50')}>
          {rows.map((row) => (
            <TableRow
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(onRowClick && 'cursor-pointer')}
            >
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  className={cn(column.numeric && 'text-right tnum', column.className)}
                >
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableWrapper>
  );
}
