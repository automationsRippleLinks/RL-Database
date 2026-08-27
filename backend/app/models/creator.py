from uuid import uuid4, UUID
from typing import Optional, TYPE_CHECKING

from sqlmodel import SQLModel, Field, Relationship, String, Index, UniqueConstraint
from sqlalchemy import Enum as SaEnum, Column
from sqlalchemy.dialects.postgresql import ARRAY
from pydantic import ConfigDict


from .link_models import CategoryCreatorLink, LanguageCreatorLink, TagCreatorLink
from .enums import PlatformChoices, TierChoices

if TYPE_CHECKING:
    from .category import Category
    from .language import Language
    from .tag import Tag
    from .link_models import PitchCreatorLink, CampaignCreatorLink


class Creator(SQLModel, table=True):
    model_config = ConfigDict(validate_assignment=True)

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)

    platform: PlatformChoices = Field(sa_type=SaEnum(PlatformChoices))
    username: str = Field(default=None, nullable=False)

    name: str
    followers: Optional[int] = Field(nullable=True)
    tier: TierChoices = Field(sa_type=SaEnum(TierChoices))
    avg_views: Optional[int] = Field(nullable=True)

    # CATEGORIES / LANGUAGES
    #
    # The relationships are the truth: they are what search filters on, what the
    # facets are built from, and what both the list and detail views render.
    #
    # The `*_raw` columns keep the sheet's original text as an audit trail and
    # nothing reads them. They are written once when the creator is inserted and
    # never revised, so the moment a creator appears on a second sheet they
    # disagree with the links -- which is exactly how they came to be showing
    # wrong values in the search table.
    categories: list["Category"] = Relationship(
        back_populates="creators", link_model=CategoryCreatorLink
    )
    categories_raw: str

    languages: list["Language"] = Relationship(
        back_populates="creators", link_model=LanguageCreatorLink
    )
    languages_raw: str

    # TAGS
    tags: list["Tag"] = Relationship(
        back_populates="creators", link_model=TagCreatorLink
    )

    gender: str
    city: str

    email: Optional[str] = Field(sa_column=Column(String, nullable=True))
    phone: Optional[str] = Field(sa_column=Column(String, nullable=True))

    additional_emails: list[str] = Field(default=[], sa_column=Column(ARRAY(String)))
    additional_phones: list[str] = Field(default=[], sa_column=Column(ARRAY(String)))

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
        UniqueConstraint("platform", "username", name="uq_creator_platform_username"),
    )
