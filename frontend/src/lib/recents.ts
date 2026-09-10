import type { SearchScope } from '@/types/api';

/**
 * "Recently opened", on the home screen.
 *
 * Per-browser and per-person by design: this is a shortcut back to what *you*
 * were just looking at, so it lives in localStorage rather than on the server —
 * no endpoint, no write on every row click, and nothing to leak between two
 * people sharing a screen. It is a convenience, so every access is wrapped:
 * private windows and blocked site data both throw on read, and an empty
 * Recently-opened row is a fine outcome where a crashed home screen is not.
 */
export interface RecentEntry {
  scope: SearchScope;
  id: string;
  label: string;
  /** Epoch ms, so the list can be ordered without parsing anything. */
  at: number;
}

const STORAGE_KEY = 'rl-recents';
const LIMIT = 6;

export function readRecents(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is RecentEntry =>
          !!entry &&
          typeof entry === 'object' &&
          typeof (entry as RecentEntry).id === 'string' &&
          typeof (entry as RecentEntry).label === 'string',
      )
      .slice(0, LIMIT);
  } catch {
    return [];
  }
}

/** Most recent first, one entry per record. */
export function rememberRecent(entry: Omit<RecentEntry, 'at'>): void {
  try {
    const next = [
      { ...entry, at: Date.now() },
      ...readRecents().filter((item) => !(item.scope === entry.scope && item.id === entry.id)),
    ].slice(0, LIMIT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Not remembering is the acceptable failure here.
  }
}
