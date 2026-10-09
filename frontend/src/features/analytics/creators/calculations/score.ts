import type { CreatorRow, ScoredKey } from '../types';
import { FIELDS } from '../rules/config';
import { appliesTo, isFieldMissing } from '../rules/missing';

/** A creator plus which of its fields are missing. Used for the table row tags, the drawer and the export. */
export interface ScoredCreator {
  creator: CreatorRow;
  /** Scored fields that apply to this creator's platform. */
  applicable: ScoredKey[];
  /** Applicable fields that are empty. */
  missing: ScoredKey[];
  /** Category / language names with blank entries removed. */
  cats: string[];
  langs: string[];
}

export function scoreCreator(creator: CreatorRow): ScoredCreator {
  const applicable = FIELDS.filter((f) => appliesTo(f.key, creator.platform)).map((f) => f.key);
  const missing = applicable.filter((k) => isFieldMissing(k, creator[k]));
  return {
    creator,
    applicable,
    missing,
    cats: creator.categories.filter((x) => x.trim() !== ''),
    langs: creator.languages.filter((x) => x.trim() !== ''),
  };
}
