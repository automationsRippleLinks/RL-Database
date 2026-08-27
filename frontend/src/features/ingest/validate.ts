/**
 * Client-side validation of an uploaded JSON export, before anything is sent.
 *
 * The shapes below mirror backend/app/schemas/apps_script_response.py
 * (PitchMasterRow, CampaignMasterRow) — the RAW sheet rows, all strings — not the
 * normalised enums in schemas/ingest.py. backend/app/services/parser.py does the
 * normalisation, and anything it doesn't recognise is silently coerced to NA. That
 * data loss is invisible today, so this validator reports it as a warning: the
 * upload is still valid, but the user gets to see what will be flattened first.
 */
import {
  RAW_ORG_TYPE_VALUES,
  RAW_PLATFORM_VALUES,
  RAW_REQUIREMENT_VALUES,
  isKnownRawValue,
} from '@/lib/enums';
import type { IngestSource } from '@/types/api';

export type FieldKind =
  | 'string'
  | 'number'
  | 'iso_date'
  | 'string_array'
  | 'email'
  /** A column the current sheet no longer sends; its presence fails the upload. */
  | 'legacy_cost'
  | 'any';

interface FieldSpec {
  name: string;
  kind: FieldKind;
  required: boolean;
  /** Raw vocabulary parser.py recognises; anything else becomes NA. */
  vocabulary?: readonly string[];
}

const PITCH_MASTER_FIELDS: FieldSpec[] = [
  { name: 'pitch_code', kind: 'string', required: true },
  { name: 'year', kind: 'number', required: true},
  { name: 'org_type', kind: 'string', required: true, vocabulary: RAW_ORG_TYPE_VALUES },
  { name: 'brand_name', kind: 'string', required: true },
  { name: 'campaign_name', kind: 'string', required: true },
  { name: 'requirement', kind: 'string', required: true, vocabulary: RAW_REQUIREMENT_VALUES },
  { name: 'platform', kind: 'string', required: true, vocabulary: RAW_PLATFORM_VALUES },
  { name: 'sales_lead', kind: 'string', required: true },
  { name: 'list_lead', kind: 'string', required: true },
  { name: 'spreadsheet_link', kind: 'string', required: true },
];

const CAMPAIGN_MASTER_FIELDS: FieldSpec[] = [
  { name: 'campaign_code', kind: 'string', required: true },
  { name: 'month_name', kind: 'string', required: true },
  { name: 'year', kind: 'number', required: true },
  { name: 'brand_name', kind: 'string', required: true },
  { name: 'campaign_name', kind: 'string', required: true },
  { name: 'manager', kind: 'string', required: true },
  { name: 'member_names', kind: 'string_array', required: false },
  { name: 'spreadsheet_link', kind: 'string', required: true },
  { name: 'report_link', kind: 'string', required: true },
  { name: 'status', kind: 'string', required: true },
  { name: 'expected_end_date', kind: 'iso_date', required: true },
  { name: 'start_date', kind: 'iso_date', required: true },
  { name: 'end_date', kind: 'iso_date', required: false },
  { name: 'report_status', kind: 'string', required: false },
  { name: 'report_completion_date', kind: 'iso_date', required: false },
  { name: 'pitch_code', kind: 'string', required: true },
];

const PITCH_CREATOR_FIELDS: FieldSpec[] = [
  { name: "source_file_id", kind: "string", required: true },
  { name: "sheet", kind: "string", required: true },
  { name: "platform", kind: "string", required: true },
  { name: "sheet_row", kind: "any", required: true },
  { name: "name", kind: "string", required: true },
  { name: "profile_link", kind: "any", required: false },
  { name: "followers", kind: "any", required: false },
  { name: "category", kind: "any", required: false },
  { name: "tier", kind: "any", required: false },
  { name: "language", kind: "any", required: false },
  { name: "gender", kind: "string", required: false },
  { name: "avg_views", kind: "any", required: false },
  { name: "city", kind: "any", required: false },
  { name: "email", kind: "email", required: false },
  { name: "phone", kind: "any", required: false },
  { name: "reel_count", kind: "any", required: false },
  { name: "reel_story_count", kind: "any", required: false },
  { name: "video_story_count", kind: "any", required: false },
  { name: "static_carousel_count", kind: "any", required: false },
  { name: "event_store_visit", kind: "any", required: false },
  { name: "short_form_videos_count", kind: "any", required: false },
  { name: "reshare_short_form_videos_count", kind: "any", required: false },
  { name: "dedicated_video_count", kind: "any", required: false },
  { name: "integrated_video_count", kind: "any", required: false },
  { name: "usage_rights", kind: "any", required: false },
  { name: "ad_promo_rights", kind: "any", required: false },
  { name: "boosting", kind: "any", required: false },
  { name: "payment_terms", kind: "string", required: false },
  // Costs, as the v3.5 sheet splits them. Instagram:
  { name: "reel_cost", kind: "any", required: false },
  { name: "reel_story_cost", kind: "any", required: false },
  { name: "video_story_cost", kind: "any", required: false },
  { name: "static_carousel_cost", kind: "any", required: false },
  // YouTube:
  { name: "short_form_videos_cost", kind: "any", required: false },
  { name: "reshare_short_form_videos_cost", kind: "any", required: false },
  { name: "dedicated_video_cost", kind: "any", required: false },
  { name: "integrated_video_cost", kind: "any", required: false },
  // Common:
  { name: "rights_cost", kind: "any", required: false },
  { name: "boosting_cost", kind: "any", required: false },
  { name: "package_cost", kind: "any", required: false },
  { name: "final_cost", kind: "any", required: false },
  { name: "brand_cost", kind: "any", required: false },
  // The v2 totals. Declared so a stale export is caught here rather than after
  // the round trip -- the backend refuses the whole batch over them.
  { name: "cost_with_deliverables", kind: "legacy_cost", required: false },
  { name: "cost_with_deliverables_usage", kind: "legacy_cost", required: false },
];

/**
 * Mirrors CampaignCreatorRow in backend/app/schemas/apps_script_response.py.
 * Nearly everything is optional and untyped there — the parser coerces — so the
 * only hard requirements are the two things a row cannot be routed without.
 */
const CAMPAIGN_CREATOR_FIELDS: FieldSpec[] = [
  { name: 'campaign_code', kind: 'string', required: true },
  { name: 'name', kind: 'any', required: false },
  { name: 'profile_link', kind: 'any', required: true },
  { name: 'source_file_id', kind: 'any', required: false },
  { name: 'sheet', kind: 'any', required: false },
  { name: 'sheet_row', kind: 'any', required: false },
  { name: 'followers', kind: 'any', required: false },
  { name: 'expected_views', kind: 'any', required: false },
  { name: 'tier', kind: 'any', required: false },
  { name: 'category', kind: 'any', required: false },
  { name: 'language', kind: 'any', required: false },
  { name: 'city', kind: 'any', required: false },
  { name: 'gender', kind: 'any', required: false },
  { name: 'poc_name', kind: 'any', required: false },
  { name: 'email', kind: 'email', required: false },
  { name: 'phone', kind: 'any', required: false },
  { name: 'is_dropped', kind: 'any', required: false },
  { name: 'deliverables_raw', kind: 'any', required: false },
  { name: 'payment_terms', kind: 'any', required: false },
  { name: 'initial_cost', kind: 'any', required: false },
  { name: 'final_cost', kind: 'any', required: false },
  { name: 'brand_cost', kind: 'any', required: false },
  { name: 'agency_fee', kind: 'any', required: false },
  { name: 'product_cost', kind: 'any', required: false },
  { name: 'shipping_cost', kind: 'any', required: false },
  { name: 'promotion_cost', kind: 'any', required: false },
  { name: 'reimbursement_cost', kind: 'any', required: false },
  { name: 'additional_cost', kind: 'any', required: false },
  { name: 'product_status', kind: 'any', required: false },
  { name: 'product_ordered_by', kind: 'any', required: false },
  { name: 'script_links', kind: 'any', required: false },
  { name: 'shoot_date', kind: 'any', required: false },
  { name: 'content_status', kind: 'any', required: false },
  { name: 'live_date', kind: 'any', required: false },
  { name: 'live_links', kind: 'any', required: false },
  // Instagram tracker
  { name: 'ig_reel_views', kind: 'any', required: false },
  { name: 'ig_reel_likes', kind: 'any', required: false },
  { name: 'ig_reel_comments', kind: 'any', required: false },
  { name: 'ig_reel_shares', kind: 'any', required: false },
  { name: 'ig_reel_saves', kind: 'any', required: false },
  { name: 'ig_story_views', kind: 'any', required: false },
  { name: 'ig_reel_reach', kind: 'any', required: false },
  { name: 'ig_story_reach', kind: 'any', required: false },
  { name: 'ig_reels_ir_perc', kind: 'any', required: false },
  { name: 'ig_reels_er_perc', kind: 'any', required: false },
  { name: 'cpv', kind: 'any', required: false },
  { name: 'ig_avg_watch_time', kind: 'any', required: false },
  { name: 'ig_total_watch_time', kind: 'any', required: false },
  { name: 'ig_skip_rate_content', kind: 'any', required: false },
  { name: 'ig_followers_view_perc', kind: 'any', required: false },
  { name: 'ig_non_followers_view_perc', kind: 'any', required: false },
  { name: 'ig_male_perc', kind: 'any', required: false },
  { name: 'ig_female_perc', kind: 'any', required: false },
  { name: 'ig_age_13_17_perc', kind: 'any', required: false },
  { name: 'ig_age_18_24_perc', kind: 'any', required: false },
  { name: 'ig_age_25_34_perc', kind: 'any', required: false },
  { name: 'ig_age_35_44_perc', kind: 'any', required: false },
  { name: 'ig_age_45_54_perc', kind: 'any', required: false },
  { name: 'ig_age_55_64_perc', kind: 'any', required: false },
  { name: 'ig_age_over_65_perc', kind: 'any', required: false },
  // YouTube tracker
  { name: 'yt_views', kind: 'any', required: false },
  { name: 'yt_likes', kind: 'any', required: false },
  { name: 'yt_comments', kind: 'any', required: false },
  { name: 'yt_er_perc', kind: 'any', required: false },
  { name: 'yt_total_impressions', kind: 'any', required: false },
  { name: 'yt_total_watch_time', kind: 'any', required: false },
];

export const SOURCE_FIELDS: Partial<Record<IngestSource, FieldSpec[]>> = {
  pitch_master: PITCH_MASTER_FIELDS,
  campaign_master: CAMPAIGN_MASTER_FIELDS,
  pitch_creator: PITCH_CREATOR_FIELDS,
  campaign_creator: CAMPAIGN_CREATOR_FIELDS,
};

export interface ValidationIssue {
  row: number;
  field: string | null;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationReport {
  ok: boolean;
  rows: unknown[];
  rowCount: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** Keys present in the file that the backend schema doesn't declare. */
  unknownFields: string[];
}

/**
 * `datetime.fromisoformat` in parser.py accepts YYYY-MM-DD and full ISO datetimes
 * but raises on anything else — including the DD/MM/YYYY that spreadsheets love —
 * so check the same shape here rather than trusting Date.parse, which is lenient.
 */
function isIsoDateLike(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(value.trim())) return false;
  return !Number.isNaN(new Date(value.trim()).getTime());
}

/**
 * The backend rejects the WHOLE upload over one malformed address -- a real
 * address or an empty cell, nothing between -- so catching it here saves a
 * round trip and a confusing all-or-nothing failure.
 *
 * Deliberately loose: this only has to catch obvious breakage ("rahul@",
 * "call me"). email-validator on the backend is the actual authority.
 */
const EMAIL_RE = /^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/;

/** Sheets often hold several addresses in one cell; the backend keeps the first. */
function splitEmails(value: string): string[] {
  return value
    .split(/[+,/|;&]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function validateIngestFile(source: IngestSource, parsed: unknown): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const fields = SOURCE_FIELDS[source];

  if (!fields) {
    return {
      ok: false,
      rows: [],
      rowCount: 0,
      unknownFields: [],
      warnings,
      errors: [
        {
          row: -1,
          field: null,
          message: `Uploads for “${source}” are not supported — the backend has no parser for this source yet.`,
          severity: 'error',
        },
      ],
    };
  }

  // Accept both a bare array and the Apps Script envelope, since people export both.
  let rows: unknown[];
  if (Array.isArray(parsed)) {
    rows = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { data?: unknown }).data)) {
    rows = (parsed as { data: unknown[] }).data;
  } else {
    return {
      ok: false,
      rows: [],
      rowCount: 0,
      unknownFields: [],
      warnings,
      errors: [
        {
          row: -1,
          field: null,
          message:
            'Expected a JSON array of rows, or an object with a "data" array (the Apps Script envelope).',
          severity: 'error',
        },
      ],
    };
  }

  if (rows.length === 0) {
    errors.push({ row: -1, field: null, message: 'The file contains no rows.', severity: 'error' });
  }

  const known = new Set(fields.map((field) => field.name));
  const unknownFields = new Set<string>();
  const seenCodes = new Map<string, number>();
  // Only the master sheets are one-row-per-code. A creator file repeats its
  // campaign_code on every row by design, so running this check there would
  // warn about every row but the first.
  const codeField =
    source === 'pitch_master' ? 'pitch_code' : source === 'campaign_master' ? 'campaign_code' : null;

  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push({
        row: index,
        field: null,
        message: `Expected an object, got ${describeType(row)}.`,
        severity: 'error',
      });
      return;
    }

    const record = row as Record<string, unknown>;

    for (const key of Object.keys(record)) {
      if (!known.has(key)) unknownFields.add(key);
    }

    for (const field of fields) {
      const value = record[field.name];
      const missing = value === undefined || value === null || value === '';

      if (missing) {
        if (field.required) {
          errors.push({
            row: index,
            field: field.name,
            message: `Missing required field “${field.name}”.`,
            severity: 'error',
          });
        }
        continue;
      }

      switch (field.kind) {
        case 'any':
          break;
        case 'number':
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            errors.push({
              row: index,
              field: field.name,
              message: `“${field.name}” must be a number, got ${describeType(value)}.`,
              severity: 'error',
            });
          }
          break;
        case 'string_array':
          if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
            errors.push({
              row: index,
              field: field.name,
              message: `“${field.name}” must be an array of strings.`,
              severity: 'error',
            });
          }
          break;
        case 'iso_date':
          if (typeof value !== 'string' || !isIsoDateLike(value)) {
            errors.push({
              row: index,
              field: field.name,
              message: `“${field.name}” must be an ISO date (YYYY-MM-DD). Got “${String(value)}”.`,
              severity: 'error',
            });
          }
          break;
        case 'legacy_cost':
          errors.push({
            row: index,
            field: field.name,
            message:
              `“${field.name}” is from the old (v2) sheet template and is no ` +
              'longer read. The backend rejects the whole upload rather than store zero ' +
              'for every cost — re-export from the current sheet.',
            severity: 'error',
          });
          break;
        case 'email': {
          const parts = splitEmails(String(value));
          const bad = parts.filter((part) => !EMAIL_RE.test(part));
          if (bad.length) {
            errors.push({
              row: index,
              field: field.name,
              message: `“${String(value)}” is not a valid email address. The backend rejects the entire upload over one bad address — fix it, or leave the cell empty.`,
              severity: 'error',
            });
          } else if (parts.length > 1) {
            warnings.push({
              row: index,
              field: field.name,
              message: `${parts.length} addresses in one cell — only “${parts[0]}” will be stored.`,
              severity: 'warning',
            });
          }
          break;
        }
        case 'string':
          if (typeof value !== 'string') {
            errors.push({
              row: index,
              field: field.name,
              message: `“${field.name}” must be a string, got ${describeType(value)}.`,
              severity: 'error',
            });
          } else if (field.vocabulary && !isKnownRawValue(value, field.vocabulary)) {
            warnings.push({
              row: index,
              field: field.name,
              message: `“${value}” is not a value the backend parser recognises — it will be stored as NA. Expected one of: ${field.vocabulary.join(', ')}.`,
              severity: 'warning',
            });
          }
          break;
      }
    }

    // Duplicate business keys inside one file: the backend skips rows whose code
    // already exists, so a duplicate here means one of the two is silently dropped.
    const code = codeField ? record[codeField] : null;
    if (codeField && typeof code === 'string' && code) {
      const firstSeen = seenCodes.get(code);
      if (firstSeen !== undefined) {
        warnings.push({
          row: index,
          field: codeField,
          message: `Duplicate ${codeField} “${code}” — also on row ${firstSeen + 1}. Only one will be inserted.`,
          severity: 'warning',
        });
      } else {
        seenCodes.set(code, index);
      }
    }
  });

  return {
    ok: errors.length === 0 && rows.length > 0,
    rows,
    rowCount: rows.length,
    errors,
    warnings,
    unknownFields: [...unknownFields],
  };
}

/** Parse then validate, turning a syntax error into a reportable issue. */
export function parseAndValidate(source: IngestSource, text: string): ValidationReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      rows: [],
      rowCount: 0,
      unknownFields: [],
      warnings: [],
      errors: [
        {
          row: -1,
          field: null,
          message: `The file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'error',
        },
      ],
    };
  }
  return validateIngestFile(source, parsed);
}
