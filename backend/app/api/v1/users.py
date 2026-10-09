"""User management, for admins. The rules are in services/users.py"""

from typing import Optional

from fastapi import APIRouter, Query, status

from app.services import users, edits
from app.schemas.edits import HistoryEntry
from app.schemas.users import UserAdminRow, UserAdminUpdate
from app.api.deps import SessionDep, RedisDep, AdminUser, CSRFProtected

router = APIRouter()


@router.get("", response_model=list[UserAdminRow])
async def list_users(
    session: SessionDep,
    redis: RedisDep,
    admin: AdminUser,
    q: Optional[str] = Query(None, description="part of a name or email"),
    employed: Optional[bool] = Query(
        None, description="true = switched on, false = switched off"
    ),
):
    return await users.listing(session, redis, q, employed)


@router.get("/{user_id}", response_model=UserAdminRow)
async def get_user(
    user_id: int, session: SessionDep, redis: RedisDep, admin: AdminUser
):
    return await users.row(redis, await users.get(session, user_id))


@router.patch("/{user_id}", response_model=UserAdminRow, dependencies=[CSRFProtected])
async def update_user(
    user_id: int,
    body: UserAdminUpdate,
    session: SessionDep,
    redis: RedisDep,
    admin: AdminUser,
):
    return await users.update(session, redis, admin, user_id, body)


@router.post(
    "/{user_id}/sign-out",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[CSRFProtected],
)
async def sign_out_user(
    user_id: int, session: SessionDep, redis: RedisDep, admin: AdminUser
):
    """End every session this user has (lost laptop, shared computer)."""
    await users.get(session, user_id)
    await users.sign_out_everywhere(redis, user_id)


@router.get("/{user_id}/history", response_model=list[HistoryEntry])
async def user_history(
    user_id: int,
    session: SessionDep,
    admin: AdminUser,
    before: Optional[int] = None,
    limit: int = Query(50, ge=1, le=200),
):
    """Changes made *to* this account. For what they changed, use GET /edits?user_id=."""
    return await edits.history(
        session, "user", str(user_id), before=before, limit=limit
    )
