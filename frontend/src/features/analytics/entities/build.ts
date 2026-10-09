import type { BrandView, CampaignView, PitchView, ProvisionalData } from './types';

/** Joins names and counts onto the stored rows. Links are counted, never treated as gaps. */
export function buildViews(d: ProvisionalData) {
  const companyName = new Map(d.companies.map((c) => [c.id, c.name]));
  const brandName = new Map(d.brands.map((b) => [b.id, b.display_name]));
  const creatorsPerBrand = new Map<number, number>();
  d.brand_creator_links.forEach((l) => creatorsPerBrand.set(l.brand_id, (creatorsPerBrand.get(l.brand_id) ?? 0) + 1));
  const campaignsPerBrand = new Map<number, number>();
  d.campaigns.forEach((c) => c.brand_id != null && campaignsPerBrand.set(c.brand_id, (campaignsPerBrand.get(c.brand_id) ?? 0) + 1));
  const pitchesPerBrand = new Map<number, number>();
  d.pitches.forEach((p) => p.brand_id != null && pitchesPerBrand.set(p.brand_id, (pitchesPerBrand.get(p.brand_id) ?? 0) + 1));
  const pitchIdsWithCampaign = new Set(d.campaigns.map((c) => c.pitch_id).filter((x): x is string => !!x));

  const brands: BrandView[] = d.brands.map((b) => ({
    ...b,
    company_name: b.company_id == null ? null : (companyName.get(b.company_id) ?? null),
    creator_count: creatorsPerBrand.get(b.id) ?? 0,
    campaign_count: campaignsPerBrand.get(b.id) ?? 0,
    pitch_count: pitchesPerBrand.get(b.id) ?? 0,
  }));
  const campaigns: CampaignView[] = d.campaigns.map((c) => ({
    ...c,
    brand_name: c.brand_id == null ? null : (brandName.get(c.brand_id) ?? null),
    has_pitch: c.pitch_id != null,
  }));
  const pitches: PitchView[] = d.pitches.map((p) => ({
    ...p,
    brand_name: p.brand_id == null ? null : (brandName.get(p.brand_id) ?? null),
    creator_count: p.creator_ids.length,
    has_campaign: pitchIdsWithCampaign.has(p.id),
  }));
  return { brands, campaigns, pitches };
}
