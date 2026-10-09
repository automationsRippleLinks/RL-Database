/**
 * The dashboard uses the app's own types. They mirror the backend schemas
 * (app/schemas/search.py and the analytics summary), so there is one copy to keep in step.
 */
import type { MissingField } from '@/types/api';

export type { CreatorRow, Platform, SearchResponse, Tier } from '@/types/api';

/** The nine details that count toward completeness. Same names the backend uses. */
export type ScoredKey = MissingField;
