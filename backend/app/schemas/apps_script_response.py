from typing import Optional, Any

from pydantic import BaseModel

class PitchMasterRow(BaseModel):
    pitch_code: str
    year: Optional[int] = None
    org_type: str
    brand_name: str
    campaign_name: str
    requirement: str
    platform: str
    sales_lead: str
    list_lead: str
    spreadsheet_link: str


class CampaignMasterRow(BaseModel):
    campaign_code: str
    month_name: str
    year: int
    brand_name: str
    campaign_name: str
    manager: str
    member_names: list[str] = []
    spreadsheet_link: str
    report_link: str
    status: str
    expected_end_date: str
    start_date: str
    end_date: str | None = None
    report_status: str | None = None
    report_completion_date: str | None = None

    pitch_code: str


class PitchCreatorRow(BaseModel):
    source_file_id: str
    sheet: str
    platform: str
    sheet_row: Any = None
    name: str
    profile_link: str = ""
    followers: Any = None
    category: Any = None
    tier: Any = None
    language: Any = None
    gender: Any = None
    avg_views: Any = None
    city: Any = None
    email: Any = None
    phone: Any = None
    reel_count: Any = None
    reel_story_count: Any = None
    video_story_count: Any = None
    static_carousel_count: Any = None
    event_store_visit: Any = ""
    short_form_videos_count: Any = None
    reshare_short_form_videos_count: Any = None
    dedicated_video_count: Any = None
    integrated_video_count: Any = None
    usage_rights: Any = ""
    ad_promo_rights: Any = ""
    boosting: Any = ""
    payment_terms: Any = ""
    cost_with_deliverables: Any = None
    cost_with_deliverables_usage: Any = None
    final_cost: Any = None
    brand_cost: Any = None

class CampaignCreatorRow(BaseModel):
    campaign_code: str
    name: str
    profile_link: str
    followers: int = 0
    expected_views: int = 0
    tier: str  = ""
    poc_name: str = ""
    email: str = ""
    phone: str = ""
    is_dropped: bool
    deliverables_raw: str = ""
    payment_terms: str = ""
    initial_cost: int = 0
    final_cost: int = 0
    brand_cost: int = 0
    agency_fee: int = 0
    product_cost: int = 0
    shipping_cost: int = 0
    promotion_cost: int = 0
    reimbursement_cost: int = 0
    additional_cost: int = 0
    product_status: str = ""
    product_ordered_by: str = ""
    script_links: str = ""
    shoot_date: str = ""
    content_status: str = ""
    live_date: str = ""
    live_links: str = ""
    ig_reel_views: str = ""
    ig_reel_likes: str = ""
    ig_reel_comments: str = ""
    ig_reel_shares: str = ""
    ig_reel_saves: str = ""
    ig_story_views: str = ""
    ig_reel_reach: str = ""
    ig_story_reach: str = ""
    ig_reels_ir_perc: str = ""
    ig_reels_er_perc: str = ""
    cpv: str = ""
    yt_views: str = ""
    yt_likes: str = ""
    yt_comments: str = ""
    yt_er_perc: str = ""
    yt_total_impressions: str = ""
    yt_total_watch_time: str = ""
