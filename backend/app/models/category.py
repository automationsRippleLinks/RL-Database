"""Creator categories (Beauty, Comedy, ...), one half of the taxonomy."""

from typing import Optional, TYPE_CHECKING

from sqlmodel import SQLModel, Relationship, Field

from .link_models import CategoryCreatorLink

if TYPE_CHECKING:
    from .creator import Creator


class Category(SQLModel, table=True):
    """A category, managed on the Taxonomy page; ingest only links to existing ones."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, nullable=False)

    creators: list["Creator"] = Relationship(
        back_populates="categories", link_model=CategoryCreatorLink
    )
