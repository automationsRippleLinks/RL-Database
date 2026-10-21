"""Fixed choices for the table columns.

The columns store these as Postgres enums of the member NAMES ('MID_TIER'), while
the API speaks the value ('mid-tier'), so renaming a member needs a migration.
"NA" is what ingest stores when the sheet gives nothing usable.
"""

from enum import Enum


class MonthChoices(str, Enum):
    """The month a campaign is filed under (with its year)."""

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
    """Where a campaign, or separately its report, stands."""

    COMPLETED = "completed"
    ON_HOLD = "on hold"
    SCRAPPED = "scrapped"
    WIP = "wip"


class PlatformChoices(str, Enum):
    """A creator profile's platform, or one of the platforms a pitch covers."""

    INSTAGRAM = "instagram"
    YOUTUBE = "youtube"
    LINKEDIN = "linkedin"
    FACEBOOK = "facebook"
    OTHERS = "others"
    NA = "NA"


class TierChoices(str, Enum):
    """Creator size by followers (tier_for in ingest); celeb comes from the sheet."""

    NANO = "nano"
    MICRO = "micro"
    MID_TIER = "mid-tier"
    MACRO = "macro"
    MEGA = "mega"
    CELEB = "celeb"
    NA = "NA"


class OrgTypeChoices(str, Enum):
    """What kind of client a pitch is for."""

    BRAND_CORE = "Brand_Core"
    BRAND_OTHER = "Brand_Other"
    AGENCY = "Agency"
    RETAINER_ACC = "Retainer_Account"
    NA = "NA"


class PitchRequirementChoices(str, Enum):
    """What the client asked for in a pitch."""

    LIST = "list"
    PLAN = "plan"
    LIST_AND_PLAN = "list_and_plan"
    CONTENT_BUCKETS = "content_buckets"
    MEDIA_PLAN = "media_plan"
    PRODUCTION = "production"
    CONTENT_BUCKETS_AND_LIST = "content_buckets_and_list"
    DEMOGRAPHICS_DATA = "demographics_data"
    NA = "NA"
