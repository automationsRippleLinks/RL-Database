"""User management rules.

    admins          change names, can_ingest, can_edit, and switch people on / off
    super admins    also grant or remove admin and super admin
    nobody          changes their own admin rights or switch themselves off
    admins          can't touch another admin or super admin (only super admins can)

Switching someone off signs them out everywhere at once; their sessions are
deleted, no just left to expire. Every change lands in edit_log as kind "user".
"""

import logging

from fastapi import HTTPException, status
from redis.asyncio import Redis
from sqlmodel import select, func, col, or_
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.models import User, EditLog
from app.core.security import destroy_other_sessions
from app.schemas.users import UserAdminRow, UserAdminUpdate

log = logging.getLogger(__name__)

_SUPER_ONLY = {"is_admin", "is_superadmin"}
_NOT_ON_YOURSELF = {"is_admin", "is_superadmin", "is_currently_employed"}


async def active_sessions(redis: Redis, user_id: int) -> int:
    sids = await redis.smembers(f"{settings.USER_SESSIONS_CACHE_PREFIX}{user_id}")
    if not sids:
        return 0
    pipe = redis.pipeline()
    for sid in sids:
        pipe.exists(f"{settings.SESSION_CACHE_PREFIX}{sid}")
    return sum(await pipe.execute())


async def sign_out_everywhere(redis: Redis, user_id: int) -> None:
    await destroy_other_sessions(redis, user_id, keep_sid="")


async def row(redis: Redis, user: User) -> UserAdminRow:
    out = UserAdminRow.model_validate(user)
    out.active_sessions = await active_sessions(redis, user.id)
    return out


async def listing(
    session: AsyncSession, redis: Redis, q: str | None, employed: bool | None
) -> list[UserAdminRow]:
    stmnt = select(User).order_by(func.lower(User.name))
    if q:
        stmnt = stmnt.where(
            or_(col(User.name).ilike(f"%{q}%"), col(User.email).ilike(f"%{q}%"))
        )
    if employed is not None:
        stmnt = stmnt.where(User.is_currently_employed == employed)
    return [await row(redis, u) for u in (await session.exec(stmnt)).all()]


async def get(session: AsyncSession, user_id: int) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No such user"
        )
    return user


def _refuse(message: str, code: int = status.HTTP_403_FORBIDDEN) -> HTTPException:
    return HTTPException(
        status_code=code, detail={"code": "forbidden", "message": message}
    )


async def update(
    session: AsyncSession,
    redis: Redis,
    actor: User,
    user_id: int,
    body: UserAdminUpdate,
) -> UserAdminRow:
    target = await get(session, user_id)
    sent = body.model_dump(exclude_unset=True)
    changed = {f: v for f, v in sent.items() if getattr(target, f) != v}

    if not actor.is_superadmin:
        if changed.keys() & _SUPER_ONLY:
            raise _refuse("Only a super admin can grant or remove admin rights")
        if (
            changed
            and (target.is_admin or target.is_superadmin)
            and target.id != actor.id
        ):
            raise _refuse("Only a super admin can change another admin")
    if target.id == actor.id and changed.keys() & _NOT_ON_YOURSELF:
        raise _refuse("You can't change your own admin rights or switch yourself off")

    if not changed:
        return await row(redis, target)

    log_changes = {f: {"from": getattr(target, f), "to": v} for f, v in changed.items()}
    for f, v in changed.items():
        setattr(target, f, v)
    session.add(target)
    session.add(
        EditLog(
            kind="user",
            record_id=str(target.id),
            action="update",
            changes=log_changes,
            user_id=actor.id,
            user_name=actor.name,
        )
    )
    await session.commit()
    await session.refresh(target)

    if changed.get("is_currently_employed") is False:
        await sign_out_everywhere(redis, target.id)
    log.info("user %s changed by user %s: %s", target.id, actor.id, ", ".join(changed))
    return await row(redis, target)
