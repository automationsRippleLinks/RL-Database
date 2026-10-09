import { AS_OF_MONTH, isDueSoon, isOverdue, isRunning } from './entities/config';
import type { BrandView, CampaignView, PitchView, ProvisionalData } from './entities/types';
import type { CreatorSummary } from '@/types/api';

/**
 * Every number on the Analytics pages is produced here, from the same lists the rest of the app uses.
 * Nothing is typed in by hand. Charts only draw what these functions return.
 */

export const STATUS_ORDER = ['wip', 'completed', 'on hold', 'scrapped'] as const;
export const STATUS_LABEL: Record<string, string> = { wip: 'Running', completed: 'Completed', 'on hold': 'On hold', scrapped: 'Scrapped' };

export const monthLabel = (m: string) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m.slice(5)) - 1];

/** Creators: how many have at least one missing tracked field, and how many have every field filled. The backend counts. */
export function creatorMetrics(summary: CreatorSummary) {
  const { total, with_gaps: missing } = summary.totals;
  return { total, missing, complete: total - missing };
}

/** Brands: campaigns per brand, ranked. Brands with no campaigns are normal, not a problem. */
export function brandMetrics(brands: readonly BrandView[], campaigns: readonly CampaignView[]) {
  const per = new Map<number, { n: number; running: number }>();
  for (const c of campaigns) {
    if (c.brand_id == null) continue;
    const e = per.get(c.brand_id) ?? { n: 0, running: 0 };
    e.n++;
    if (isRunning(c)) e.running++;
    per.set(c.brand_id, e);
  }
  const everyBrand = brands
    .map((b) => ({ id: b.id, name: b.display_name, campaigns: per.get(b.id)?.n ?? 0, running: per.get(b.id)?.running ?? 0, pitches: b.pitch_count, creators: b.creator_count }))
    .sort((a, b) => b.campaigns - a.campaigns || a.name.localeCompare(b.name));
  const ranked = everyBrand.filter((b) => b.campaigns > 0);
  return { total: brands.length, ranked, all: everyBrand, withCampaigns: ranked.length, withoutCampaigns: brands.length - ranked.length };
}

/** Campaigns: status counts (activity), plus performance only where views were logged (completed campaigns). */
export function campaignMetrics(campaigns: readonly CampaignView[], data: ProvisionalData) {
  const byStatus = STATUS_ORDER.map((s) => ({ status: s, label: STATUS_LABEL[s], n: campaigns.filter((c) => c.status === s).length }));
  const running = campaigns.filter(isRunning).length;

  const started = new Map<string, number>();
  for (const c of campaigns) {
    const m = c.start_date.slice(0, 7);
    started.set(m, (started.get(m) ?? 0) + 1);
  }
  const perMonth = [...started.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, n]) => ({ month, n }));

  const expected = new Map<string, number>();
  const actual = new Map<string, number>();
  const linked = new Set<string>();
  for (const l of data.campaign_creator_links) {
    linked.add(l.campaign_id);
    expected.set(l.campaign_id, (expected.get(l.campaign_id) ?? 0) + l.expected_views);
    actual.set(l.campaign_id, (actual.get(l.campaign_id) ?? 0) + l.ig_reel_views + l.ig_story_views);
  }
  const performance = campaigns
    .filter((c) => c.status === 'completed' && linked.has(c.id))
    .map((c) => ({ id: c.id, name: c.campaign_name, expected: expected.get(c.id) ?? 0, actual: actual.get(c.id) ?? 0 }))
    .sort((a, b) => b.actual - a.actual);

  return { total: campaigns.length, running, byStatus, overdue: campaigns.filter(isOverdue).length, dueSoon: campaigns.filter(isDueSoon).length, perMonth, performance };
}

/** Pitches: there is no status field, so this shows what the data does hold: the campaign link, dates and requirement. */
export function pitchMetrics(pitches: readonly PitchView[]) {
  const linked = pitches.filter((p) => p.has_campaign).length;
  const byMonth = new Map<string, number>();
  for (const p of pitches) {
    const m = p.created_at.slice(0, 7);
    if (m < AS_OF_MONTH) byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }
  const perMonth = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, n]) => ({ month, n }));
  const req = new Map<string, number>();
  for (const p of pitches) if (p.requirement !== 'NA' && p.requirement.trim()) req.set(p.requirement, (req.get(p.requirement) ?? 0) + 1);
  const byRequirement = [...req.entries()].map(([key, n]) => ({ key, label: key.replace(/_/g, ' '), n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  return { total: pitches.length, linked, notLinked: pitches.length - linked, perMonth, byRequirement, requirementUnknown: pitches.length - byRequirement.reduce((a, r) => a + r.n, 0) };
}

export const compact = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));
