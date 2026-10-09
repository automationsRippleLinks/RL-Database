/** One colour per meaning, used on the landing cards and the opened views alike. Tokens live in styles/completeness.css. */
export const STATUS_COLOR: Record<string, string> = {
  wip: 'var(--series)',
  completed: 'var(--pale)',
  'on hold': 'var(--amber)',
  scrapped: 'var(--slate)',
};
export const CREATOR_COLOR = { missing: 'var(--miss)', complete: 'var(--series)' };
export const PITCH_COLOR = { linked: 'var(--series)', none: 'var(--slate)' };
export const BRAND_COLOR = 'var(--series)';
