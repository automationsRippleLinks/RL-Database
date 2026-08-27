"""drop the trigram indexes on creator.categories_raw / languages_raw

Creator search moved onto the category / language tables, and the list view now
renders those too, so nothing queries the raw columns any more. Two GIN indexes
were still being maintained on every creator insert for queries that no longer
exist.

The columns themselves stay: they are the only record of what the source sheet
actually said, which is worth keeping even though nothing displays it.

Revision ID: b2d5f8ca4e21
Revises: a1c4e7b93f10
Create Date: 2026-08-25

"""

from alembic import op

revision = "b2d5f8ca4e21"
down_revision = "a1c4e7b93f10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_creator_cats_trgm", table_name="creator")
    op.drop_index("ix_creator_langs_trgm", table_name="creator")


def downgrade() -> None:
    op.create_index(
        "ix_creator_cats_trgm",
        "creator",
        ["categories_raw"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"categories_raw": "gin_trgm_ops"},
    )
    op.create_index(
        "ix_creator_langs_trgm",
        "creator",
        ["languages_raw"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"languages_raw": "gin_trgm_ops"},
    )
