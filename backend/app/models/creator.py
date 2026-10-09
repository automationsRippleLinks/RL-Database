from uuid import uuid4, UUID
from typing import Optional, TYPE_CHECKING

from sqlmodel import (
    Field,
    Relationship,
    String,
    Index,
    UniqueConstraint,
    text,
)
from sqlalchemy import Enum as SaEnum, Column
from sqlalchemy.dialects.postgresql import ARRAY
from pydantic import ConfigDict, AwareDatetime


from .link_models import (
    CategoryCreatorLink,
    LanguageCreatorLink,
    TagCreatorLink,
    BrandCreatorLink,
)
from .enums import PlatformChoices, TierChoices
from .versioned import Versioned

if TYPE_CHECKING:
    from .category import Category
    from .language import Language
    from .tag import Tag
    from .brand import Brand
    from .link_models import PitchCreatorLink, CampaignCreatorLink
    from .commercial_package import CommercialPackage


class Creator(Versioned, table=True):
    model_config = ConfigDict(validate_assignment=True)

    id: Optional[UUID] = Field(
        default_factory=uuid4,
        primary_key=True,
        sa_column_kwargs={"server_default": text("uuidv4()")},
    )

    platform: PlatformChoices = Field(sa_type=SaEnum(PlatformChoices))
    username: str = Field(default=None, nullable=False)

    name: str
    followers: Optional[int] = Field(
        default=0, nullable=True, sa_column_kwargs={"server_default": "0"}
    )
    tier: TierChoices = Field(sa_type=SaEnum(TierChoices))
    avg_views: Optional[int] = Field(
        default=0, nullable=True, sa_column_kwargs={"server_default": "0"}
    )

    categories: list["Category"] = Relationship(
        back_populates="creators", link_model=CategoryCreatorLink
    )
    languages: list["Language"] = Relationship(
        back_populates="creators", link_model=LanguageCreatorLink
    )
    tags: list["Tag"] = Relationship(
        back_populates="creators", link_model=TagCreatorLink
    )
    brands: list["Brand"] = Relationship(
        back_populates="creators", link_model=BrandCreatorLink
    )

    gender: Optional[str] = Field(default=None, nullable=True)
    city: Optional[str] = Field(default=None, nullable=True)
    state: Optional[str] = Field(default=None, nullable=True)
    region: Optional[str] = Field(default=None, nullable=True)

    commercial_packages: list["CommercialPackage"] = Relationship(
        back_populates="creator"
    )

    emails: list[str] = Field(
        default_factory=list,
        sa_column=Column(ARRAY(String), server_default=text("ARRAY[]::VARCHAR[]")),
    )
    phones: list[str] = Field(
        default_factory=list,
        sa_column=Column(ARRAY(String), server_default=text("ARRAY[]::VARCHAR[]")),
    )

    bio: Optional[str] = Field(default=None, nullable=True)

    # false = the profile is gone (deleted / deactivated on the platform). Kept for
    # its pitch and campaign history, but left out of search and Apify refreshes.
    is_active: bool = Field(
        default=True,
        nullable=False,
        index=True,
        sa_column_kwargs={"server_default": "true"},
    )

    stats_refreshed_at: Optional[AwareDatetime] = Field(
        default=None, nullable=True, index=True
    )

    affiliated_pitches: list["PitchCreatorLink"] = Relationship(
        back_populates="creator",
    )
    affiliated_campaigns: list["CampaignCreatorLink"] = Relationship(
        back_populates="creator",
    )

    __table_args__ = (
        Index(
            "ix_creator_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
        Index(
            "ix_creator_username_trgm",
            "username",
            postgresql_using="gin",
            postgresql_ops={"username": "gin_trgm_ops"},
        ),
        Index(
            "ix_creator_city_trgm",
            "city",
            postgresql_using="gin",
            postgresql_ops={"city": "gin_trgm_ops"},
        ),
        Index(
            "ix_creator_state_trgm",
            "state",
            postgresql_using="gin",
            postgresql_ops={"state": "gin_trgm_ops"},
        ),
        Index(
            "ix_creator_region_trgm",
            "region",
            postgresql_using="gin",
            postgresql_ops={"region": "gin_trgm_ops"},
        ),
        UniqueConstraint("platform", "username", name="uq_creator_platform_username"),
    )
