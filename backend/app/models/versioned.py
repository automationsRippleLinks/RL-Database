"""A version number on every row people can edit by hand.

The edit form remembers the version it loaded and sends it back with the save.
If the row has moved on in the meantime -- someone else saved, an upload filled
a blank, an Apify refresh rewrote the follower count -- the save is refused
instead of silently overwriting that change.
"""

from sqlalchemy import event, inspect
from sqlmodel import SQLModel, Field


class Versioned(SQLModel):
    version: int = Field(
        default=1, nullable=False, sa_column_kwargs={"server_default": "1"}
    )


@event.listens_for(Versioned, "before_update", propagate=True)
def _bump_version(mapper, connection, target) -> None:
    # the edit service sets the next version itself; don't add a second one
    if not inspect(target).attrs.version.history.has_changes():
        target.version = (target.version or 0) + 1
