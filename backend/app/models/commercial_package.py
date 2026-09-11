from typing import Optional, TYPE_CHECKING
from uuid import UUID, uuid4
from datetime import datetime, timezone

from sqlmodel import SQLModel, Field, text, Relationship, Index

if TYPE_CHECKING:
    from .creator import Creator


class CommercialPackage(SQLModel, table=True):
    id: Optional[UUID] = Field(
        default_factory=uuid4,
        primary_key=True,
        sa_column_kwargs={"server_default": text("uuidv4()")},
    )
    creator_id: UUID = Field(foreign_key="creator.id", nullable=False, index=True)
    name: str = Field(default="Standard", nullable=False)
    cost: int = Field(nullable=False)

    valid_from: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column_kwargs={"server_default": text("now()")},
        nullable=False,
    )

    valid_to: Optional[datetime] = Field(default=None, nullable=True)

    creator: "Creator" = Relationship(back_populates="commercial_packages")
    deliverables: list["PackageDeliverables"] = Relationship(back_populates="package")

    __table_args__ = (
        Index(
            "uq_creator_package_current",
            "creator_id",
            "name",
            unique=True,
            postgresql_where=text("valid_to IS NULL"),
        ),
    )


class PackageDeliverables(SQLModel, table=True):
    id: Optional[UUID] = Field(
        default_factory=uuid4,
        primary_key=True,
        sa_column_kwargs={"server_default": text("uuidv4()")},
    )

    package_id: UUID = Field(
        foreign_key="commercialpackage.id", nullable=False, index=True
    )
    deliverable_type: str = Field(nullable=False, index=True)
    quantity: int = Field(default=1, nullable=False)
    price: int = Field(default=0, nullable=False)

    package: "CommercialPackage" = Relationship(back_populates="deliverables")
