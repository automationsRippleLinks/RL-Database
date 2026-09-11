from typing import Optional
from datetime import datetime, timezone

from sqlmodel import SQLModel, Field, func, text
from pydantic import ConfigDict, field_validator


class User(SQLModel, table=True):
    model_config = ConfigDict(validate_assignment=True)

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str = Field(unique=True, index=True, nullable=False)
    auth_provider: str = Field(
        default="password",
        nullable=False,
        sa_column_kwargs={"server_default": "password"},
    )

    hashed_password: Optional[str] = Field(default=None, nullable=True)
    is_verified: bool = Field(
        default=False, nullable=False, sa_column_kwargs={"server_default": "false"}
    )
    is_currently_employed: bool = Field(
        default=True, nullable=False, sa_column_kwargs={"server_default": "true"}
    )
    is_superadmin: bool = Field(
        default=False, nullable=False, sa_column_kwargs={"server_default": "false"}
    )
    is_admin: bool = Field(
        default=False, nullable=False, sa_column_kwargs={"server_default": "false"}
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column_kwargs={"server_default": func.now()},
    )
    last_activity_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column_kwargs={"server_default": func.now()},
    )

    # permissions
    can_ingest: bool = Field(
        default=False, nullable=False, sa_column_kwargs={"server_default": "false"}
    )

    @field_validator("email", mode="after")
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.lower().strip()
