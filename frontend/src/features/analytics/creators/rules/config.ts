import { NONE_VALUE } from '@/types/api';
import type { Platform, ScoredKey } from '../types';

/**
 * ASSUMPTION (configurable): avg views is only scored for these platforms.
 * The backend only reads views for Instagram and YouTube. On any other platform the
 * field is "not applicable" and leaves the percentage. Change this one set to change the rule.
 */
export const AVG_VIEWS_PLATFORMS: ReadonlySet<string> = new Set<Platform>(['instagram', 'youtube']);

export interface FieldDef {
  key: ScoredKey;
  /** Singular noun used in labels, e.g. "Email available: 145". */
  label: string;
}

/**
 * The nine fields checked for gaps. A field only counts where it applies (see AVG_VIEWS_PLATFORMS).
 * Not checked: name, username, platform (identifiers), tier (follows from followers) and region.
 */
export const FIELDS: readonly FieldDef[] = [
  { key: 'followers', label: 'Followers' },
  { key: 'avg_views', label: 'Avg views' },
  { key: 'emails', label: 'Email' },
  { key: 'phones', label: 'Phone' },
  { key: 'gender', label: 'Gender' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'categories', label: 'Category' },
  { key: 'languages', label: 'Language' },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<ScoredKey, FieldDef>;

export const PLATFORMS: readonly { key: Platform; label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'others', label: 'Others' },
];

export const PLATFORM_LABEL: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.key, p.label]));

/** Value used by the category/language filters for "creators with none". The backend understands it too. */
export const NONE = NONE_VALUE;

export const PAGE_SIZE = 20;
