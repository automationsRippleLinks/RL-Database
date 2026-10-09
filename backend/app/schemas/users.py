from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict


class UserAdminRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    auth_provider: str
    is_verified: bool
    is_currently_employed: bool
    is_admin: bool
    is_superadmin: bool
    can_ingest: bool
    can_edit: bool
    created_at: datetime
    last_activity_at: datetime
    active_sessions: int = 0

class UserAdminUpdate(BaseModel):
    """Only what is sent changes. Admin and super admin rights: super admins only."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(default=None, min_length=1, max_length=100)

    # false = switched off: can't sign in, and signed out everywhere at once
    is_currently_employed: bool = None
    can_ingest: bool = None
    can_edit: bool = None
    is_admin: bool = None
    is_superadmin: bool = None
