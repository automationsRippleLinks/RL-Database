import type { CreatorRow, ScoredKey } from '../types';
import { appliesTo } from './missing';

/** Fields a person may change from the drawer. Each key is also a column on CreatorRow. */
export interface CreatorPatch {
  followers?: number | null;
  avg_views?: number | null;
  emails?: string[];
  phones?: string[];
  city?: string | null;
  state?: string | null;
  gender?: string | null;
  /** Taxonomy ids, as the backend expects them. */
  categories?: number[];
  languages?: number[];
}

export type FieldErrors = Partial<Record<ScoredKey, string>>;

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const MAX_TEXT = 80;
const MAX_LIST = 10;

/** Splits "a@x.com, b@x.com" (commas, semicolons or new lines) into clean, de-duplicated entries. */
export function parseList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,;\n]/)) {
    const v = part.trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

/** Parses a whole-number box. '' -> null (left empty). Returns undefined when it is not a valid count. */
export function parseCount(text: string): number | null | undefined {
  const t = text.trim().replace(/,/g, '');
  if (t === '') return null;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : undefined;
}

function validEmail(v: string) {
  return v.length <= 254 && EMAIL.test(v);
}
function validPhone(v: string) {
  const digits = v.replace(/[\s().-]/g, '');
  return /^\+?\d{7,15}$/.test(digits);
}

/** Checks a patch for one creator. The backend must run the equivalent checks; this is the shared rule set. */
export function validatePatch(patch: CreatorPatch, creator: Pick<CreatorRow, 'platform'>): FieldErrors {
  const e: FieldErrors = {};
  for (const key of Object.keys(patch) as (keyof CreatorPatch)[]) {
    const v = patch[key];
    if (!appliesTo(key as ScoredKey, creator.platform as never)) {
      e[key as ScoredKey] = 'This field does not apply to this platform.';
      continue;
    }
    switch (key) {
      case 'followers':
      case 'avg_views':
        // 0 is how the database stores "not known", so a real count starts at 1. Leave the box empty if unknown.
        if (v !== null && (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1)) e[key] = 'Enter a whole number, 1 or more.';
        break;
      case 'emails': {
        const list = v as string[];
        if (list.length > MAX_LIST) e[key] = `At most ${MAX_LIST} emails.`;
        else {
          const bad = list.find((x) => !validEmail(x));
          if (bad) e[key] = `"${bad}" is not a valid email address.`;
        }
        break;
      }
      case 'phones': {
        const list = v as string[];
        if (list.length > MAX_LIST) e[key] = `At most ${MAX_LIST} phone numbers.`;
        else {
          const bad = list.find((x) => !validPhone(x));
          if (bad) e[key] = `"${bad}" is not a valid phone number (7 to 15 digits, optional +).`;
        }
        break;
      }
      case 'city':
      case 'state':
      case 'gender':
        if (v !== null && (typeof v !== 'string' || v.length > MAX_TEXT)) e[key] = `Up to ${MAX_TEXT} characters.`;
        break;
      case 'categories':
      case 'languages':
        if ((v as number[]).length > MAX_LIST) e[key] = `Pick at most ${MAX_LIST}.`;
        break;
    }
  }
  return e;
}
