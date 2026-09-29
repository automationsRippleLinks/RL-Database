/**
 * CSV export of the current result page — the one thing from the Streamlit app
 * people will have built habits around.
 */
import type { Paging, SearchResponse } from '@/types/api';
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = Array.isArray(value) ? value.join('; ') : String(value);
  // Quote when the value contains a delimiter, quote or newline; double inner quotes.
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<Row extends object>(
  rows: Row[],
  columns: { key: keyof Row & string; header: string }[],
): string {
  const head = columns.map((column) => escapeCell(column.header)).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCell(row[column.key])).join(','));
  return [head, ...body].join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM so Excel opens UTF-8 names (Devanagari, accented characters) correctly.
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
// ── FETCH ALL MATCHING RESULTS FOR CSV EXPORT ──────────────────
// Loads every pagination page using the current search and filters.
// A failed or incomplete request throws an error instead of downloading
// a CSV that silently omits records.

export async function fetchAllSearchRows<Row, Request extends Paging>(
  request: Request,
  fetchPage: (pageRequest: Request) => Promise<SearchResponse<Row>>,
): Promise<Row[]> {
  const pageSize = 250;

  const loadPage = (page: number) =>
    fetchPage({
      ...request,
      page,
      page_size: pageSize,
    });

  const firstPage = await loadPage(1);
  const allRows = [...firstPage.rows];

  for (let page = 2; page <= firstPage.pages; page++) {
    const response = await loadPage(page);

    if (response.page !== page) {
      throw new Error('Export returned an unexpected page. Please try again.');
    }

    allRows.push(...response.rows);
  }

  if (allRows.length < firstPage.total) {
    throw new Error('Some results could not be exported. Please try again.');
  }

  return allRows;
}