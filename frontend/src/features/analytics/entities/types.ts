/**
 * PROVISIONAL row shapes for Brands, Campaigns and Pitches.
 * Field names follow the RL-Database models (brand.py, company.py, campaign.py, pitch.py, link_models.py),
 * but the mock data is fictional and these shapes are NOT a backend contract. Check them against the real
 * response schemas before integrating.
 */
export interface CompanyRow { id: number; name: string }

export interface BrandRow {
  id: number;
  name: string;
  display_name: string;
  gstin: string | null;
  company_id: number | null;
}

export type CampaignStatus = 'completed' | 'on hold' | 'scrapped' | 'wip';

export interface CampaignRow {
  id: string;
  campaign_code: string;
  month_name: string;
  year: number;
  brand_id: number | null;
  campaign_name: string;
  manager: string;
  member_names: string[];
  pitch_id: string | null;
  spreadsheet_id: string;
  report_id: string;
  status: CampaignStatus;
  expected_end_date: string;
  start_date: string;
  end_date: string | null;
  report_status: CampaignStatus;
  report_completion_date: string | null;
}

export interface PitchRow {
  id: string;
  pitch_code: string;
  org_type: string;
  brand_id: number | null;
  campaign_name: string;
  requirement: string;
  platform: string[];
  sales_lead: string;
  list_lead: string;
  spreadsheet_id: string;
  created_at: string;
  updated_at: string;
  /** From the pitch-creator link table. */
  creator_ids: string[];
}

export interface ProvisionalData {
  _meta: { provisional: boolean; note: string; as_of: string; generator: string };
  companies: CompanyRow[];
  brands: BrandRow[];
  brand_creator_links: { brand_id: number; creator_id: string }[];
  campaigns: CampaignRow[];
  pitches: PitchRow[];
  /** Mirrors CampaignCreatorLink: expected views per creator, and logged Instagram reel/story views. */
  campaign_creator_links: CampaignCreatorLinkRow[];
}

export interface CampaignCreatorLinkRow {
  campaign_id: string;
  creator_id: string;
  expected_views: number;
  ig_reel_views: number;
  ig_story_views: number;
}

/* Rows as the tabs show them: the stored row plus names and counts joined in. */
export interface BrandView extends BrandRow {
  company_name: string | null;
  creator_count: number;
  campaign_count: number;
  pitch_count: number;
}
export interface CampaignView extends CampaignRow {
  brand_name: string | null;
  has_pitch: boolean;
}
export interface PitchView extends PitchRow {
  brand_name: string | null;
  creator_count: number;
  has_campaign: boolean;
}
