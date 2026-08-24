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
    """One Campaign Status / Tracker row, exactly as the sheet exports it.

    EVERY cell is `Any`. Google Sheets hands the same column back as an int, a
    float, a string or "" depending on what the user typed, so declaring these
    as `str` made pydantic reject the whole row -- e.g. ig_reel_views=198112
    (an int) against `str` is a hard ValidationError in pydantic v2, which
    doesn't coerce int -> str. Coercion belongs in the parser, where a bad cell
    becomes a row warning instead of a lost row.

    The audience / watch-time block is optional: the v1 Tracker tab has none of
    those columns, so absent means "sheet didn't ship it" and the parser fills
    the model default (0.00 / zero duration) rather than failing the row.
    """

    campaign_code: str
    name: Any = ""
    profile_link: Any = ""

    # optional routing hints -- present on Apps Script exports, absent on uploads
    source_file_id: Any = None
    sheet: Any = ""
    sheet_row: Any = None

    # creator identity
    followers: Any = None
    expected_views: Any = None
    tier: Any = ""
    category: Any = ""
    language: Any = ""
    city: Any = ""
    gender: Any = ""
    poc_name: Any = ""
    email: Any = ""
    phone: Any = ""

    # link / commercials
    is_dropped: Any = False
    deliverables_raw: Any = ""
    payment_terms: Any = ""
    initial_cost: Any = None
    final_cost: Any = None
    brand_cost: Any = None
    agency_fee: Any = None
    product_cost: Any = None
    shipping_cost: Any = None
    promotion_cost: Any = None
    reimbursement_cost: Any = None
    additional_cost: Any = None
    product_status: Any = ""
    product_ordered_by: Any = ""
    script_links: Any = ""
    shoot_date: Any = ""
    content_status: Any = ""
    live_date: Any = ""
    live_links: Any = ""

    # tracker -- Instagram
    ig_reel_views: Any = None
    ig_reel_likes: Any = None
    ig_reel_comments: Any = None
    ig_reel_shares: Any = None
    ig_reel_saves: Any = None
    ig_story_views: Any = None
    ig_reel_reach: Any = None
    ig_story_reach: Any = None
    ig_reels_ir_perc: Any = None
    ig_reels_er_perc: Any = None
    cpv: Any = None

    # tracker -- Instagram audience / watch time (optional, see docstring)
    ig_avg_watch_time: Any = None
    ig_total_watch_time: Any = None
    ig_skip_rate_content: Any = None
    ig_followers_view_perc: Any = None
    ig_non_followers_view_perc: Any = None
    ig_male_perc: Any = None
    ig_female_perc: Any = None
    ig_age_13_17_perc: Any = None
    ig_age_18_24_perc: Any = None
    ig_age_25_34_perc: Any = None
    ig_age_35_44_perc: Any = None
    ig_age_45_54_perc: Any = None
    ig_age_55_64_perc: Any = None
    ig_age_over_65_perc: Any = None

    # tracker -- YouTube
    yt_views: Any = None
    yt_likes: Any = None
    yt_comments: Any = None
    yt_er_perc: Any = None
    yt_total_impressions: Any = None
    yt_total_watch_time: Any = None
