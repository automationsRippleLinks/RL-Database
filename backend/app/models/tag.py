"""Free-form tags on creators."""

from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

from .link_models import TagCreatorLink

if TYPE_CHECKING:
    from .creator import Creator


class Tag(SQLModel, table=True):
    """A label on creators; the creator form creates new ones by name as needed."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(nullable=False, unique=True)

    creators: list["Creator"] = Relationship(
        back_populates="tags", link_model=TagCreatorLink
    )
