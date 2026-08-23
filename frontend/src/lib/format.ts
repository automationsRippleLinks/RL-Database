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

/** "fitness, lifestyle , travel" → ["fitness", "lifestyle", "travel"] */
export function splitRawList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,/|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}
