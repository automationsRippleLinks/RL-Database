"""Languages creators make content in, the other half of the taxonomy."""

from typing import Optional, TYPE_CHECKING

from sqlmodel import SQLModel, Field, Relationship

from .link_models import LanguageCreatorLink

if TYPE_CHECKING:
    from .creator import Creator


class Language(SQLModel, table=True):
    """A language, managed on the Taxonomy page; ingest only links to existing ones."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, nullable=False)

    creators: list["Creator"] = Relationship(
        back_populates="languages", link_model=LanguageCreatorLink
    )
