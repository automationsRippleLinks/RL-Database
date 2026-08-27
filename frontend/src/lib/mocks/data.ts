/**
 * Deterministic fixture data for VITE_USE_MOCKS mode.
 *
 * None of the endpoints this app needs exist in the backend yet, so without this
 * the UI could not be reviewed at all. Everything is generated from a seeded PRNG
 * so screenshots and demos are reproducible.
 */
import type {
  BrandRef,
  CampaignCreatorRow,
  CampaignRow,
  CampaignStatus,
  CompanyRef,
  CreatorRow,
  Month,
  OrgType,
  PitchCreatorRow,
  PitchRow,
  PitchRequirement,
  Platform,
  Tier,
} from '@/types/api';
import { MONTHS } from '@/lib/enums';

/** mulberry32 — small, seeded, good enough for fixtures. */
function makeRng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(20260813);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function pickSome<T>(items: readonly T[], min: number, max: number): T[] {
  const count = min + Math.floor(rng() * (max - min + 1));
  const pool = [...items];
  const out: T[] = [];
  for (let i = 0; i < count && pool.length; i += 1) {
    out.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  }
  return out;
}

function intBetween(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function uuid(n: number): string {
  const hex = n.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

// ─── vocabularies ────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Aarav', 'Ananya', 'Ishaan', 'Diya', 'Vihaan', 'Saanvi', 'Kabir', 'Myra',
  'Arjun', 'Aadhya', 'Reyansh', 'Kiara', 'Advik', 'Anika', 'Rudra', 'Navya',
  'Dhruv', 'Prisha', 'Aryan', 'Zara', 'Shaurya', 'Riya', 'Atharv', 'Meera',
  'Krishna', 'Tara', 'Yuvan', 'Nitara', 'Veer', 'Alia',
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Iyer', 'Nair', 'Reddy', 'Kapoor', 'Mehta', 'Joshi',
  'Chatterjee', 'Bose', 'Gupta', 'Singh', 'Patel', 'Rao', 'Khan', 'Desai',
  'Malhotra', 'Bhat', 'Pillai', 'Thakur',
];

const CITIES = [
  'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata',
  'Ahmedabad', 'Jaipur', 'Lucknow', 'Chandigarh', 'Kochi', 'Indore', 'Surat',
];

const CATEGORIES = [
  'Fitness', 'Fashion', 'Beauty', 'Food', 'Travel', 'Tech', 'Gaming', 'Comedy',
  'Finance', 'Lifestyle', 'Parenting', 'Automobile', 'Education', 'Music', 'Dance',
];

const LANGUAGES = [
  'Hindi', 'English', 'Marathi', 'Tamil', 'Telugu', 'Kannada', 'Bengali',
  'Malayalam', 'Gujarati', 'Punjabi',
];

const GENDERS = ['Female', 'Male', 'Non-binary'];

const BRANDS = [
  'Zerodha', 'Mamaearth', 'boAt', 'Nykaa', 'CRED', 'Swiggy', 'Zomato', 'Licious',
  'Sugar Cosmetics', 'Wakefit', 'Noise', 'Bewakoof', 'The Whole Truth', 'Atomberg',
  'Country Delight', 'Rage Coffee', 'Plum Goodness', 'Beardo', 'Slice', 'Groww',
];

const PEOPLE = [
  'Neha Raut', 'Karan Bhatia', 'Sana Qureshi', 'Rohit Menon', 'Tanvi Shah',
  'Aditya Kulkarni', 'Pooja Nambiar', 'Farhan Ali', 'Sneha Pillai', 'Varun Sethi',
];

const PLATFORM_POOL: Platform[] = ['instagram', 'youtube', 'linkedin', 'facebook', 'others'];
const ORG_TYPE_POOL: OrgType[] = ['Brand_Core', 'Brand_Other', 'Agency', 'Retainer_Account'];
const REQUIREMENT_POOL: PitchRequirement[] = [
  'list', 'plan', 'list_and_plan', 'content_buckets', 'media_plan', 'production',
  'content_buckets_and_list', 'demographics_data',
];
const STATUS_POOL: CampaignStatus[] = ['wip', 'completed', 'on hold', 'scrapped'];

/** Mirrors `tier_for` in backend/app/services/parser.py. */
function tierForFollowers(followers: number): Tier {
  if (!followers) return '';
  if (followers < 20_000) return 'nano';
  if (followers < 100_000) return 'micro';
  if (followers < 250_000) return 'mid-tier';
  if (followers < 1_000_000) return 'macro';
  return 'mega';
}

function handleFor(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z]/g, '');
  return `${base}${pick(['', '_', '.'])}${pick(['', String(intBetween(1, 99)), 'official', 'daily'])}`;
}

// ─── creators ────────────────────────────────────────────────────────────────

export const MOCK_CREATORS: CreatorRow[] = Array.from({ length: 240 }, (_, i) => {
  const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  const followers = Math.floor(10 ** (3 + rng() * 4.2));
  const platform = rng() < 0.68 ? 'instagram' : pick(PLATFORM_POOL);
  const categories = pickSome(CATEGORIES, 1, 3);
  const languages = pickSome(LANGUAGES, 1, 3);
  // Some rows deliberately lack contact details so has_email / has_phone bite.
  const hasEmail = rng() < 0.72;
  const hasPhone = rng() < 0.55;
  const username = handleFor(name);

  return {
    id: uuid(i + 1),
    name,
    username,
    platform,
    // Tier is derived from followers, never carried on the row.
    tier: tierForFollowers(followers),
    followers,
    avg_views: rng() < 0.9 ? Math.floor(followers * (0.05 + rng() * 0.6)) : null,
    city: rng() < 0.93 ? pick(CITIES) : null,
    gender: pick(GENDERS),
    categories,
    languages,
    email: hasEmail ? `${username.replace(/[^a-z0-9]/g, '')}@gmail.com` : null,
    phone: hasPhone ? `+91${intBetween(70, 99)}${intBetween(10_000_000, 99_999_999)}` : null,
  } satisfies CreatorRow;
});

// ─── brands and companies ────────────────────────────────────────────────────
//
// `Brand` is a real table now, so the fixtures model it as one: a keyed row that
// pitches and campaigns point at by id, optionally owned by a Company.

export interface MockBrand {
  id: number;
  name: string;
  gstin: string | null;
  company: CompanyRef | null;
}

export const MOCK_COMPANIES: CompanyRef[] = BRANDS.slice(0, 12).map((brand, i) => ({
  id: (i + 1) * 10,
  name: `${brand} Technologies Pvt Ltd`,
  // Company.gstin is nullable now, so some genuinely have none.
  gstin: i % 4 === 3 ? null : `27AAAAA${1000 + i * 7}A1Z${i % 10}`,
}));

export const MOCK_BRANDS: MockBrand[] = BRANDS.map((name, i) => ({
  id: i + 1,
  name,
  // Brand.gstin is NOT NULL in the DB but may be the empty string.
  gstin: i % 5 === 4 ? '' : `29BBBBB${2000 + i * 3}B1Z${i % 10}`,
  company: i < MOCK_COMPANIES.length ? MOCK_COMPANIES[i] : null,
}));

const brandRef = (brand: MockBrand): BrandRef => ({ id: brand.id, name: brand.name });

/**
 * Nothing in the backend populates `brand_id` yet, so a sizeable share of rows
 * deliberately carry `brand: null`. That keeps the "not linked" path exercised in
 * the UI and the smoke test rather than only existing in theory.
 */
const UNLINKED_BRAND_RATE = 0.18;

function maybeBrandRef(): BrandRef | null {
  if (rng() < UNLINKED_BRAND_RATE) return null;
  return brandRef(pick(MOCK_BRANDS));
}

// ─── pitches ─────────────────────────────────────────────────────────────────

export const MOCK_PITCHES: PitchRow[] = Array.from({ length: 90 }, (_, i) => {
  const brand = maybeBrandRef();
  const label = brand?.name ?? 'Unassigned';
  const orgType = pick(ORG_TYPE_POOL);
  const created = new Date(2025, intBetween(0, 11), intBetween(1, 28));
  const converted = rng() < 0.62;
  return {
    id: uuid(10_000 + i),
    pitch_code: `RL-P${String(i + 101).padStart(4, '0')}-2025`,
    brand,
    campaign_name: `${label} ${pick(['Launch', 'Festive', 'Always-On', 'Awareness', 'Monsoon', 'Diwali', 'Summer'])} ${pick(['Push', 'Blast', 'Campaign', 'Sprint'])}`,
    org_type: orgType,
    requirement: pick(REQUIREMENT_POOL),
    platform: pickSome(PLATFORM_POOL, 1, 2),
    sales_lead: pick(PEOPLE),
    list_lead: pick(PEOPLE),
    creator_count: intBetween(0, 45),
    converted,
    spreadsheet_link: `https://docs.google.com/spreadsheets/d/pitch-${i + 101}`,
    created_at: created.toISOString(),
    updated_at: created.toISOString(),
  } satisfies PitchRow;
});

// ─── campaigns ───────────────────────────────────────────────────────────────

export const MOCK_CAMPAIGNS: CampaignRow[] = Array.from({ length: 120 }, (_, i) => {
  const linkedPitch = rng() < 0.75 ? MOCK_PITCHES[Math.floor(rng() * MOCK_PITCHES.length)] : null;
  // A campaign inherits its pitch's brand when it came from one — that's the shape
  // the FK gives you, and it keeps the two consistent.
  const brand = linkedPitch ? linkedPitch.brand : maybeBrandRef();
  const monthIndex = intBetween(0, 11);
  const year = pick([2024, 2025, 2026]);
  const start = new Date(year, monthIndex, intBetween(1, 20));
  const expectedEnd = new Date(start.getTime() + intBetween(20, 70) * 86_400_000);
  const status = pick(STATUS_POOL);
  const ended = status === 'completed';

  return {
    id: uuid(20_000 + i),
    campaign_code: `RL-C${String(i + 201).padStart(4, '0')}`,
    campaign_name:
      linkedPitch?.campaign_name ??
      `${brand?.name ?? 'Unassigned'} ${pick(['Reels', 'Shorts', 'Hybrid'])} Drive`,
    brand,
    manager: pick(PEOPLE),
    member_names: pickSome(PEOPLE, 1, 3),
    month_name: MONTHS[monthIndex] as Month,
    year,
    status,
    report_status: ended ? pick(['completed', 'wip']) : 'wip',
    start_date: start.toISOString().slice(0, 10),
    expected_end_date: expectedEnd.toISOString().slice(0, 10),
    end_date: ended ? expectedEnd.toISOString().slice(0, 10) : null,
    report_completion_date:
      ended && rng() < 0.6 ? new Date(expectedEnd.getTime() + 6 * 86_400_000).toISOString().slice(0, 10) : null,
    creator_count: intBetween(1, 38),
    spreadsheet_link: `https://docs.google.com/spreadsheets/d/campaign-${i + 201}`,
    report_link: `https://docs.google.com/spreadsheets/d/report-${i + 201}`,
    _pitchId: linkedPitch?.id ?? null,
    _pitchCode: linkedPitch?.pitch_code ?? null,
  } as CampaignRow & { _pitchId: string | null; _pitchCode: string | null };
});

// ─── link rows (the per-creator payload inside a campaign / pitch) ────────────

/**
 * Distinct creators, deterministically chosen. CampaignCreatorLink and
 * PitchCreatorLink both have a composite (creator_id, link_id) primary key, so the
 * same creator cannot appear twice on one campaign or pitch — the fixtures have to
 * respect that or they'd model something the schema forbids.
 */
function distinctCreators(seed: number, count: number): CreatorRow[] {
  const local = makeRng(seed);
  const start = Math.floor(local() * MOCK_CREATORS.length);
  // A stride coprime with the pool size walks every entry exactly once.
  const stride = 7;
  const wanted = Math.min(count, MOCK_CREATORS.length);
  return Array.from(
    { length: wanted },
    (_, i) => MOCK_CREATORS[(start + i * stride) % MOCK_CREATORS.length],
  );
}

export function mockCampaignCreators(campaignId: string, count: number): CampaignCreatorRow[] {
  const local = makeRng(Number.parseInt(campaignId.slice(-6), 16) || 7);
  const chosen = distinctCreators(Number.parseInt(campaignId.slice(-6), 16) || 7, count);
  return chosen.map((creator, i) => {
    const isIg = creator.platform === 'instagram';
    const views = Math.floor((creator.followers ?? 10_000) * (0.1 + local() * 0.9));
    const finalCost = Math.floor((creator.followers ?? 10_000) * (0.4 + local() * 1.6));
    const dropped = local() < 0.08;
    return {
      creator_id: creator.id,
      name: creator.name,
      username: creator.username,
      platform: creator.platform,
      tier: creator.tier,
      followers: creator.followers,
      is_dropped: dropped,
      deliverables_raw: isIg ? '1 Reel + 2 Stories' : '1 Integrated video',
      // Vary the ratio per row, otherwise every "vs expected" cell reads the same.
      expected_views: Math.floor(views * (0.6 + local() * 0.8)),
      poc_name: [pick(PEOPLE)],
      initial_cost: Math.floor(finalCost * 1.15),
      final_cost: finalCost,
      brand_cost: Math.floor(finalCost * 1.25),
      agency_fee: Math.floor(finalCost * 0.1),
      payment_terms: pick(['50% advance', 'Net 30', 'Net 45', '100% on delivery']),
      product_status: pick(['Delivered', 'Shipped', 'Not required', 'Pending']),
      content_status: dropped ? 'Dropped' : pick(['Live', 'Approved', 'In review', 'Script pending']),
      shoot_date: `2025-${String(intBetween(1, 12)).padStart(2, '0')}-${String(intBetween(1, 28)).padStart(2, '0')}`,
      live_date: dropped ? null : `2025-${String(intBetween(1, 12)).padStart(2, '0')}-${String(intBetween(1, 28)).padStart(2, '0')}`,
      live_links: dropped ? null : `https://www.instagram.com/reel/mock${i}`,
      script_links: `https://docs.google.com/document/d/script-${i}`,
      ig_reel_views: isIg ? views : 0,
      ig_reel_likes: isIg ? Math.floor(views * 0.06) : 0,
      ig_reel_comments: isIg ? Math.floor(views * 0.004) : 0,
      ig_reel_shares: isIg ? Math.floor(views * 0.009) : 0,
      ig_reel_saves: isIg ? Math.floor(views * 0.011) : 0,
      ig_reel_reach: isIg ? Math.floor(views * 0.78) : 0,
      ig_story_views: isIg ? Math.floor(views * 0.12) : 0,
      ig_story_reach: isIg ? Math.floor(views * 0.1) : 0,
      ig_avg_watch_time: isIg ? intBetween(4, 22) : 0,
      ig_total_watch_time: isIg ? intBetween(20_000, 900_000) : 0,
      ig_reels_er_perc: isIg ? intBetween(2, 12) : 0,
      ig_reels_ir_perc: isIg ? intBetween(1, 9) : 0,
      ig_male_perc: intBetween(20, 70),
      ig_female_perc: intBetween(20, 70),
      yt_views: isIg ? 0 : views,
      yt_likes: isIg ? 0 : Math.floor(views * 0.04),
      yt_comments: isIg ? 0 : Math.floor(views * 0.002),
      yt_er_perc: isIg ? 0 : intBetween(1, 8),
      yt_total_impressions: isIg ? 0 : Math.floor(views * 3.4),
      yt_total_watch_time: isIg ? 0 : intBetween(100_000, 3_000_000),
      cpv: views ? (finalCost / views).toFixed(2) : '0.00',
    } satisfies CampaignCreatorRow;
  });
}

export function mockPitchCreators(pitchId: string, count: number): PitchCreatorRow[] {
  const seed = Number.parseInt(pitchId.slice(-6), 16) || 11;
  const local = makeRng(seed);
  return distinctCreators(seed, count).map((creator) => {
    const isIg = creator.platform === 'instagram';
    const reelCost = Math.floor((creator.followers ?? 10_000) * 0.9);
    const videoCost = Math.floor((creator.followers ?? 10_000) * 1.8);
    const finalCost = isIg ? reelCost : videoCost;
    return {
      creator_id: creator.id,
      name: creator.name,
      username: creator.username,
      platform: creator.platform,
      tier: creator.tier,
      followers: creator.followers,
      reel_count: isIg ? intBetween(1, 3) : 0,
      reel_story_count: isIg ? intBetween(0, 3) : 0,
      video_story_count: isIg ? intBetween(0, 2) : 0,
      static_carousel_count: isIg ? intBetween(0, 2) : 0,
      event_store_visit: local() < 0.15,
      short_form_videos_count: isIg ? 0 : intBetween(0, 2),
      reshare_short_form_videos_count: isIg ? 0 : intBetween(0, 1),
      dedicated_video_count: isIg ? 0 : intBetween(0, 1),
      integrated_video_count: isIg ? 0 : intBetween(0, 2),
      usage_rights: pick(['30 days', '90 days', 'Perpetual', null]),
      ad_promo_rights: pick(['Yes — 30 days', 'No', null]),
      boosting: pick(['Allowed', 'Not allowed', null]),
      payment_terms: pick(['50% advance', 'Net 30', 'Net 45']),
      reel_cost: isIg ? reelCost : 0,
      reel_story_cost: isIg ? Math.floor(reelCost * 0.2) : 0,
      video_story_cost: isIg ? Math.floor(reelCost * 0.25) : 0,
      static_carousel_cost: isIg ? Math.floor(reelCost * 0.4) : 0,
      short_form_videos_cost: isIg ? 0 : Math.floor(videoCost * 0.35),
      reshare_short_form_videos_cost: 0,
      dedicated_video_cost: isIg ? 0 : videoCost,
      integrated_video_cost: isIg ? 0 : Math.floor(videoCost * 0.7),
      rights_cost: Math.floor(finalCost * 0.1),
      boosting_cost: Math.floor(finalCost * 0.05),
      package_cost: finalCost,
      final_cost: finalCost,
      brand_cost: Math.floor(finalCost * 1.25),
    } satisfies PitchCreatorRow;
  });
}

export { BRANDS, CITIES, CATEGORIES, LANGUAGES, GENDERS, PEOPLE };
