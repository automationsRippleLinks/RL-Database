import type { CampaignView } from './types';

/**
 * What counts as "running": a campaign whose status is `wip` (work in progress).
 * The campaign statuses in the database are completed, on hold, scrapped and wip. On hold is paused, so it is not
 * running. Change this one list to change the definition everywhere.
 */
export const RUNNING_STATUSES: readonly string[] = ['wip'];
export const isRunning = (c: { status: string }) => RUNNING_STATUSES.includes(c.status);

/**
 * The dashboard's fixed "today". Mock dates are built around it so counts are stable.
 * In RipplePulse use the real current date: `new Date().toISOString().slice(0, 10)`.
 */
export const AS_OF = '2026-10-02';
/** Pitches from the month in progress are left out of "per month" lines until the month ends. */
export const AS_OF_MONTH = AS_OF.slice(0, 7);
/** "Due soon" = running and due within this many days. */
export const DUE_SOON_DAYS = 14;

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const DUE_SOON_END = addDays(AS_OF, DUE_SOON_DAYS);

export const isOverdue = (c: CampaignView) => isRunning(c) && c.expected_end_date < AS_OF;
export const isDueSoon = (c: CampaignView) => isRunning(c) && c.expected_end_date >= AS_OF && c.expected_end_date <= DUE_SOON_END;
