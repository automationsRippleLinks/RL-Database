import { FIELD_BY_KEY, NONE, PLATFORM_LABEL } from '../rules/config';
import type { FilterState } from './filters';

/** The active filters as short phrases: ["Instagram", "Email missing", ...]. Empty when nothing is filtered. */
export function activeParts(s: FilterState): string[] {
  const parts: string[] = [];
  if (s.plat.length) parts.push(s.plat.map((v) => PLATFORM_LABEL[v] ?? v).join(' / '));
  if (s.cat.length) parts.push(s.cat.map((v) => (v === NONE ? 'No category' : v)).join(' / '));
  if (s.lang.length) parts.push(s.lang.map((v) => (v === NONE ? 'No language' : v)).join(' / '));
  if (s.field) parts.push(`${FIELD_BY_KEY[s.field].label} missing`);
  if (s.q.trim()) parts.push(`Search "${s.q.trim()}"`);
  return parts;
}

export function anyFilter(s: FilterState): boolean {
  return activeParts(s).length > 0;
}

/** "Instagram · Email missing · 36 creators"  /  "All creators · 200 creators" */
export function summaryLine(s: FilterState, count: number): string {
  const parts = activeParts(s);
  return [...(parts.length ? parts : ['All creators']), `${count.toLocaleString('en-IN')} ${count === 1 ? 'creator' : 'creators'}`].join(' · ');
}

/** The sentence shown when the table is empty. */
export function emptyMessage(s: FilterState): string {
  if (s.field) return `No creators are missing ${FIELD_BY_KEY[s.field].label.toLowerCase()} with these filters.`;
  if (s.q.trim()) return `No creators match "${s.q.trim()}" with these filters.`;
  return 'No creators match these filters.';
}

/** Safe file-name fragment for the download, e.g. "instagram-email-missing". */
export function filterSlug(s: FilterState): string {
  const slug = activeParts(s)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'all';
}
