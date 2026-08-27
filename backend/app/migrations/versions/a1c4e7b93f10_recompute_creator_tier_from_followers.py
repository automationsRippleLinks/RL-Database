"""recompute creator tier from followers

Tier used to be whatever the tier cell of the source spreadsheet said, mapped
through a lookup table. That made it unreliable in a way that was easy to miss:
the same creator could be MICRO on one sheet and MID_TIER on another with an
identical follower count, and a creator whose sheet left the cell blank kept NA
forever, because ingest never revises a creator row once it exists.

Tier is derived from `followers` now (services/parser.py::tier_for). This brings
the rows already in the table into line with that rule.

CELEB is preserved wherever it is already set: it is the one band that is an
editorial judgement rather than a threshold, so recomputing it from followers
would silently demote every celebrity in the database.

Note the enum stores member NAMES ('MID_TIER', 'NA'), not values ('mid-tier',
'') -- see the baseline revision.

Revision ID: a1c4e7b93f10
Revises: c8aea8f03c67
Create Date: 2026-08-25

"""

from alembic import op

revision = "a1c4e7b93f10"
down_revision = "c8aea8f03c67"
branch_labels = None
depends_on = None


RECOMPUTE_TIER = """
    UPDATE creator
       SET tier = CASE
                    WHEN followers IS NULL OR followers = 0 THEN 'NA'
                    WHEN followers <   20000 THEN 'NANO'
                    WHEN followers <  100000 THEN 'MICRO'
                    WHEN followers <  250000 THEN 'MID_TIER'
                    WHEN followers < 1000000 THEN 'MACRO'
                    ELSE 'MEGA'
                  END::tierchoices
     WHERE tier <> 'CELEB'
"""


def upgrade() -> None:
    op.execute(RECOMPUTE_TIER)


def downgrade() -> None:
    """No-op.

    The per-row tier this replaces came from spreadsheet cells that were never
    stored anywhere else, so there is nothing to restore it from. Re-ingesting
    the source sheets would produce these same computed values anyway.
    """
    pass
