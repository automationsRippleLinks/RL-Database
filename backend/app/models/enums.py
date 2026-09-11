from enum import Enum


class MonthChoices(str, Enum):
    JANUARY = "january"
    FEBRUARY = "february"
    MARCH = "march"
    APRIL = "april"
    MAY = "may"
    JUNE = "june"
    JULY = "july"
    AUGUST = "august"
    SEPTEMBER = "september"
    OCTOBER = "october"
    NOVEMBER = "november"
    DECEMBER = "december"


class CampaignStatusChoices(str, Enum):
    COMPLETED = "completed"
    ON_HOlD = "on hold"
    SCRAPPED = "scrapped"
    WIP = "wip"


class PlatformChoices(str, Enum):
    INSTAGRAM = "instagram"
    YOUTUBE = "youtube"
    LINKEDIN = "linkedin"
    FACEBOOK = "facebook"
    OTHERS = "others"
    NA = "NA"


class TierChoices(str, Enum):
    NANO = "nano"
    MICRO = "micro"
    MID_TIER = "mid-tier"
    MACRO = "macro"
    MEGA = "mega"
    CELEB = "celeb"
    NA = "NA"


class OrgTypeChoices(str, Enum):
    BRAND_CORE = "Brand_Core"
    BRAND_OTHER = "Brand_Other"
    AGENCY = "Agency"
    RETAINER_ACC = "Retainer_Account"
    NA = "NA"


class PitchRequirementChoices(str, Enum):
    LIST = "list"
    PLAN = "plan"
    LIST_AND_PLAN = "list_and_plan"
    CONTENT_BUCKETS = "content_buckets"
    MEDIA_PLAN = "media_plan"
    PRODUCTION = "production"
    CONTENT_BUCKETS_AND_LIST = "content_buckets_and_list"
    DEMOGRAPHICS_DATA = "demographics_data"
    NA = "NA"
