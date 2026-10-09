import type { ScoredKey } from '../types';
import { AVG_VIEWS_PLATFORMS } from './config';

/**
 * Is this value "missing"?
 *  - null / undefined                      -> missing
 *  - empty or whitespace-only text         -> missing
 *  - a list with no non-blank text entry   -> missing
 *  - any number (see isFieldMissing for the two count fields)
 */
export function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) {
    return !value.some((x) => typeof x === 'string' && x.trim() !== '');
  }
  return false;
}

/**
 * The rule for one detail. It must match the backend's rule list, because the backend does the counting
 * and this decides which tags a row shows. Followers and avg views are counts: the database stores 0 for
 * "not known", so anything below 1 is missing. Everything else uses isMissing.
 */
export function isFieldMissing(key: ScoredKey, value: unknown): boolean {
  if (key === 'followers' || key === 'avg_views') return typeof value !== 'number' || value < 1;
  return isMissing(value);
}

/** Does this scored field apply to a creator on this platform? */
export function appliesTo(key: ScoredKey, platform: string): boolean {
  return key !== 'avg_views' || AVG_VIEWS_PLATFORMS.has(platform);
}
