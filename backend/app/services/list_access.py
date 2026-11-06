"""Who may do what with a list. Every list route goes through here.

    owner                         manage  (view, edit, share, delete)
    admin / super admin           manage, except on private lists (not even visible)
    visibility "everyone"         the list's audience_level
    visibility "team"             the list's audience_level, for people in its team
    visibility "people"           only the people picked in list_share
    a person picked in list_share the level given to them, if higher than the above
                                  (so one colleague can edit a list others only view)
    private                       the owner alone; list_share is ignored
    anyone else                   nothing: the list does not exist for them (404)

A person who can see a list but lacks the level an action needs gets a 403.
"""

from uuid import UUID
from typing import Optional

from fastapi import HTTPException, status
from sqlmodel import select, col, or_, and_
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import User, SavedList, ListShare

_RANK = {"view": 1, "edit": 2, "manage": 3}


def _is_admin(user: User) -> bool:
    return bool(user.is_admin or user.is_superadmin)


def level_for(
    user: User, lst: SavedList, shared_level: Optional[str] = None
) -> Optional[str]:
    """The user's level on this list ("view" | "edit" | "manage"), or None.

    `shared_level` is the user's row in list_share for this list, if any. This is
    the one place the rules above are written as code; visible_clause() below is
    the same rules as a database filter, for listings.
    """
    if lst.owner_id == user.id:
        return "manage"
    if lst.visibility == "private":
        return None
    if _is_admin(user):
        return "manage"
    base: Optional[str] = None
    if lst.visibility == "everyone":
        base = lst.audience_level
    elif lst.visibility == "team":
        if user.team_id is not None and user.team_id == lst.team_id:
            base = lst.audience_level
    # "people" has no base: only a share row gives access
    if shared_level is not None and (base is None or _RANK[shared_level] > _RANK[base]):
        return shared_level
    return base


def visible_clause(user: User):
    """A WHERE condition that keeps only the lists this user can see."""
    shared_with_me = select(ListShare.list_id).where(ListShare.user_id == user.id)
    conditions = [
        SavedList.owner_id == user.id,
        SavedList.visibility == "everyone",
        # picked one by one (ignored on private lists)
        and_(
            SavedList.visibility != "private",
            col(SavedList.id).in_(shared_with_me),
        ),
    ]
    if user.team_id is not None:
        conditions.append(
            and_(SavedList.visibility == "team", SavedList.team_id == user.team_id)
        )
    if _is_admin(user):
        conditions.append(SavedList.visibility != "private")
    return or_(*conditions)


async def get_list(
    session: AsyncSession, user: User, list_id: UUID, need: str = "view"
) -> tuple[SavedList, str]:
    """The list and the user's level on it.

    404 if the user can't see it (same answer as "no such list", so private
    lists are never revealed); 403 if they can see it but lack the `need` level.
    """
    lst = await session.get(SavedList, list_id)
    shared = await session.get(ListShare, (list_id, user.id)) if lst else None
    level = level_for(user, lst, shared.level if shared else None) if lst else None
    if level is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No such list")
    if _RANK[level] < _RANK[need]:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail={
                "code": "forbidden",
                "message": f"You can only {level} this list",
            },
        )
    return lst, level