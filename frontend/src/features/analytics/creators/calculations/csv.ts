import { FIELD_BY_KEY } from '../rules/config';
import type { ScoredCreator } from './score';

const COLUMNS = ['Name', 'Username', 'Platform', 'Followers', 'Avg views', 'Email', 'Phone', 'City', 'State', 'Gender', 'Category', 'Language', 'Profile URL', 'Missing fields', 'Missing count'];

/** Stops spreadsheet programs from running a cell that starts with = @ - + as a formula. Phone numbers (+91...) and negatives stay as they are. */
function safe(text: string): string {
  return /^[=@\t\r]|^[-+](?!\d)/.test(text) ? `'${text}` : text;
}

export function cell(v: string | number | null | undefined): string {
  const text = v === null || v === undefined ? '' : safe(String(v));
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One row per creator in the list, ALL of them (not just the visible page). */
export function creatorsToCsv(rows: readonly ScoredCreator[]): string {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    const c = r.creator;
    lines.push(
      [
        c.name,
        c.username,
        c.platform,
        c.followers,
        c.avg_views,
        c.emails.filter((x) => x.trim()).join('; '),
        c.phones.filter((x) => x.trim()).join('; '),
        c.city,
        c.state,
        c.gender,
        r.cats.join('; '),
        r.langs.join('; '),
        c.profile_url,
        r.missing.map((k) => FIELD_BY_KEY[k].label).join('; '),
        r.missing.length,
      ]
        .map(cell)
        .join(','),
    );
  }
  return lines.join('\r\n');
}

/** Generic CSV for the other tabs: a header row plus one line per record (all of them, not one page). */
export function tableToCsv(headers: readonly string[], rows: readonly (string | number | null | undefined)[][]): string {
  return [headers.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n');
}
