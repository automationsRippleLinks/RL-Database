from sqlmodel import SQLModel
from .link_models import (
    LanguageCreatorLink,
    PitchCreatorLink,
    CategoryCreatorLink,
    CampaignCreatorLink,
    TagCreatorLink,
    BrandCreatorLink
)
from .pitch import Pitch
from .category import Category
from .language import Language
from .creator import Creator
from .company import Company
from .auth import User
from .campaign import Campaign
from .brand import Brand
from .ingest_job import IngestJob
from .tag import Tag
from .commercial_package import CommercialPackage, PackageDeliverables

# resolving forward references to avoid circular import error
Pitch.model_rebuild()
Category.model_rebuild()
Language.model_rebuild()
Creator.model_rebuild()
Company.model_rebuild()
Campaign.model_rebuild()
Brand.model_rebuild()

__all__ = [
    "LanguageCreatorLink",
    "PitchCreatorLink",
    "CategoryCreatorLink",
    "CampaignCreatorLink",
    "TagCreatorLink",
    "BrandCreatorLink",
    "Tag",
    "Category",
    "Language",
    "Creator",
    "Pitch",
    "Company",
    "User",
    "Campaign",
    "Brand",
    "IngestJob",
    "CommercialPackage",
    "PackageDeliverables",
]
