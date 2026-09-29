import { useRef, type ReactNode } from 'react';
import { TickBox } from './TickBox';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from './ui/table';
import { Skeleton } from './ui/skeleton';

export interface Column<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  numeric?: boolean;
  className?: string;
  headerClassName?: string;
}

interface RowSelection<Row> {
  picked: Record<string, boolean>;
  onTogglePick: (id: string) => void;
  onTogglePage: () => void;


  // SHIFT-CLICK RANGE SELECTION AND DESELECTION
  onSelectRange?: (range: Row[], shouldSelect: boolean) => void;
  label: (row: Row) => string;
  headerClassName?: string;
}

interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  isFetching?: boolean;
  isLoading?: boolean;
  emptyState?: ReactNode;
  maxHeightClass?: string;

  // Optional features for the four search-result tables.
  appearance?: 'default' | 'results';
  selection?: RowSelection<Row>;
  activeRowKey?: string | null;
}

const RESULTS_HEAD =
  'sticky top-0 z-[3] h-auto bg-rp-head px-[13px] py-2.5 text-[12px] font-bold tracking-[0.05em] whitespace-nowrap text-rp-muted uppercase shadow-[inset_0_-1px_0_var(--rp-border)]';

const RESULTS_CELL = 'px-[13px] py-2.5';

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isFetching = false,
  isLoading = false,
  emptyState,
  maxHeightClass = 'flex-1 min-h-0',
  appearance = 'default',
  selection,
  activeRowKey,
}: DataTableProps<Row>) {
  const isResults = appearance === 'results';
  // ── SHIFT-CLICK RANGE SELECTION ────────────────────────────────
  // Remember the last row clicked without Shift.
  const selectionAnchor = useRef<string | null>(null);

  const pickRow = (row: Row, shiftKey: boolean) => {
    if (!selection) return;

    const clickedKey = rowKey(row);

    if (shiftKey && selection.onSelectRange && selectionAnchor.current !== null) {
      const start = rows.findIndex(
        (item) => rowKey(item) === selectionAnchor.current,
      );
      const end = rows.findIndex(
        (item) => rowKey(item) === clickedKey,
      );

      // Select every visible row between the anchor and clicked row.
      if (start !== -1 && end !== -1) {
        const from = Math.min(start, end);
        const to = Math.max(start, end);

        // Unchecked end row: select the range.
        // Checked end row: deselect the range.
        selection.onSelectRange(
          rows.slice(from, to + 1),
          !Boolean(selection.picked[clickedKey]),
        ); return;
      }
    }

    // Ordinary checkbox click: toggle one row and set a new anchor.
    selection.onTogglePick(clickedKey);
    selectionAnchor.current = clickedKey;
  };
  if (isLoading) {
    const skeletons = (
      <div className="space-y-2 p-3">
        {Array.from({ length: isResults ? 10 : 8 }, (_, index) => (
          <Skeleton
            key={index}
            className={isResults ? 'h-9 w-full' : 'h-8 w-full'}
          />
        ))}
      </div>
    );

    return isResults ? (
      skeletons
    ) : (
      <TableWrapper className={maxHeightClass}>
        {skeletons}
      </TableWrapper>
    );
  }

  if (!rows.length && !isResults) {
    return (
      <TableWrapper className="p-0">
        {emptyState}
      </TableWrapper>
    );
  }

  const allPicked =
    !!selection &&
    rows.length > 0 &&
    rows.every((row) => !!selection.picked[rowKey(row)]);

  const table = (
    <Table className={cn(isResults && 'table-fixed text-[12px]')}>
      <TableHeader
        className={cn(
          isResults &&
          'static bg-transparent backdrop-blur-none [&_tr]:border-0',
        )}
      >
        <TableRow className="hover:bg-transparent">
          {selection && (
            <TableHead
              className={cn(
                isResults && RESULTS_HEAD,
                'text-left',
                selection.headerClassName ?? 'w-10',
              )}
            >
              <TickBox
                checked={allPicked}
                onClick={() => {
                  selectionAnchor.current = null;
                  selection.onTogglePage();
                }}
                label="Select everyone on this page"
              />
            </TableHead>
          )}

          {columns.map((column) => (
            <TableHead
              key={column.id}
              className={cn(
                isResults && RESULTS_HEAD,
                column.numeric && 'text-right',
                column.headerClassName,
              )}
            >
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>

      <TableBody
        className={cn(
          'transition-opacity',
          isFetching && 'opacity-50',
        )}
      >
        {rows.map((row) => {
          const key = rowKey(row);
          const isPicked = !!selection?.picked[key];
          const isActive =
            activeRowKey != null && key === activeRowKey;

          return (
            <TableRow
              key={key}
              onClick={(event) => {
                // SHIFT-CLICK: Select the range without opening the detail.
                if (event.shiftKey && selection?.onSelectRange) {
                  pickRow(row, true);
                  return;
                }

                // NORMAL CLICK: Open the drawer or detail page.
                onRowClick?.(row);
              }}
              className={cn(
                onRowClick && 'cursor-pointer',
                isResults &&
                'border-t border-b-0 border-rp-border',
                isResults &&
                (isActive
                  ? 'bg-rp-primary-soft shadow-[inset_3px_0_0_var(--rp-primary)] hover:bg-rp-primary-soft'
                  : isPicked
                    ? 'bg-rp-surface2 hover:bg-rp-surface2'
                    : 'hover:bg-rp-surface2'),
              )}
            >
              {selection && (
                <TableCell
                  className={cn(
                    isResults && RESULTS_CELL,
                    'text-left',
                  )}
                >
                  <TickBox
                    checked={isPicked}
                    label={`Select ${selection.label(row)}`}
                    onClick={(event) => {
                      // Don't open the drawer when clicking the checkbox.
                      event.stopPropagation();

                      // Shift selects a range; normal click selects one row.
                      pickRow(row, event.shiftKey);
                    }}
                  />
                </TableCell>
              )}

              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  className={cn(
                    isResults && RESULTS_CELL,
                    column.numeric && 'text-right tnum',
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  // Search pages already have their own scrollable results container.
  // Other pages keep the original TableWrapper.
  return isResults ? (
    table
  ) : (
    <TableWrapper className={maxHeightClass}>
      {table}
    </TableWrapper>
  );
}