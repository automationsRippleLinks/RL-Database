import type { Platform } from '@/types/api';

/** 1_250_000 → "1.3M". Indian-audience data, but K/M/B reads fine internally. */
export function humaniseCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${trimZero(value / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${trimZero(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${trimZero(value / 1_000)}K`;
  return String(value);
}

function trimZero(n: number): string {
  const s = n.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

export function formatNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-IN');
}

/** Costs in this database are rupees. */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `₹${value.toLocaleString('en-IN')}`;
}

export function formatPercent(value: string | number | null | undefined, dp = 1): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(dp)}%`;
}

/** ISO date (or datetime) → "12 Aug 2026". Dates here are plain `date` columns. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
export function formatMonthYear(
  month: number | null | undefined,
  year: number | null | undefined,
) : string{
  if (!year) return '';
  if (!month || month < 1 || month >12) return String(year);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN',{
    month : 'short',
    year: 'numeric',
  });
}

/** True when this month and year are more than 12 months ago. Unknown date = false. */
export function isOlderThanYear(
  month: number | null | undefined,
  year: number | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!month || !year) return false;
  const monthsAgo = now.getFullYear() * 12 + now.getMonth() - (year * 12 + (month - 1));
  return monthsAgo > 12;
}

/**
 * CampaignCreatorLink stores watch times as Postgres intervals (Python timedelta).
 * Depending on the serialiser those arrive as total seconds or an ISO-8601
 * duration ("PT1M30S"), so accept both.
 */
export function formatDuration(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const seconds = typeof value === 'number' ? value : parseDurationSeconds(value);
  if (seconds === null) return String(value);
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return secs ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function parseDurationSeconds(value: string): number | null {
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) return numeric;

  const iso = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(value);
  if (iso) {
    const [, d, h, m, s] = iso;
    return (
      Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0)
    );
  }

  // Postgres also renders intervals as "HH:MM:SS[.ffffff]".
  const clock = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value);
  if (clock) {
    const [, h, m, s] = clock;
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
  }
  return null;
}

/**
 * Creator has no profile_url column. The backend should compute one, but derive
 * the same value client-side so the link column works regardless.
 */
export function deriveProfileUrl(platform: Platform, username: string): string | null {
  const handle = username?.trim().replace(/^@/, '');
  if (!handle) return null;
  switch (platform) {
    case 'instagram':
      return `https://www.instagram.com/${handle}`;
    case 'youtube':
      return `https://www.youtube.com/@${handle}`;
    case 'linkedin':
      return `https://www.linkedin.com/in/${handle}`;
    case 'facebook':
      return `https://www.facebook.com/${handle}`;
    default:
      return null;
  }
}

export function profileUrlFor(row: {
  platform: Platform;
  username: string;
  profile_url?: string | null;
}): string | null {
  return row.profile_url ?? deriveProfileUrl(row.platform, row.username);
}

/** Views per follower — the one derived metric the Streamlit detail panel showed. */
export function engagementRatio(
  avgViews: number | null | undefined,
  followers: number | null | undefined,
): string {
  if (!avgViews || !followers) return '—';
  return `${((avgViews / followers) * 100).toFixed(1)}%`;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  const head = local.slice(0, 1);
  return `${head}${'•'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

export function maskPhone(phone: string): string {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 4) return '•••';
  return `${'•'.repeat(Math.max(digits.length - 4, 3))}${digits.slice(-4)}`;
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/**
 * The results table's number format, distinct from `humaniseCount` above.
 *
 * humaniseCount targets prose ("1.3M followers"); this targets a right-aligned
 * numeric column, where the handoff asks for two decimals in the millions and
 * whole thousands past 100K so the digits line up: 3.79M · 828K · 61.2K.
 */
export function compact(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.0+$/, '')}M`;
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  }
  return String(value);
}

/**
 * Reads the shorthand people actually type into the reach filters: `25000`,
 * `25,000`, `25k`, `1.5m`. Anything else is null, which the caller treats as
 * "no bound" rather than as an error — a half-typed "1." shouldn't blank the
 * result set mid-keystroke.
 */
export function parseAmount(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().toLowerCase().replace(/[, ]/g, '');
  if (!text) return null;
  const match = /^([0-9]*\.?[0-9]+)([km])?$/.exec(text);
  if (!match) return null;
  const multiplier = match[2] === 'm' ? 1_000_000 : match[2] === 'k' ? 1_000 : 1;
  return Math.round(parseFloat(match[1]) * multiplier);
}

/** "Ananya Deshpande" → "AD". Used for the avatar tiles in the table and drawer. */
export function initials(name: string): string {
  return (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "12 days ago", then a date. */
export function timeAgo(value: string | null | undefined): string {
  if (!value) return '—';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return '—';
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return formatDate(value);
}

/** ₹ with Indian grouping and no decimals, or an em dash. */
export function rupees(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

/** ₹ compact: ₹4.2L, ₹1.3Cr, ₹85K. */
export function rupeesCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(value >= 1e8 ? 0 : 1)}Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(value >= 1e6 ? 0 : 1)}L`;
  if (value >= 1e3) return `₹${Math.round(value / 1e3)}K`;
  return `₹${Math.round(value)}`;
}
