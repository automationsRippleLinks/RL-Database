"""Shared route dependencies: DB session, Redis, the signed-in user, the CSRF check
and the permission gates. Super admins pass every permission gate."""

from typing import Annotated
from datetime import datetime, timezone

from fastapi import Depends, Request, HTTPException, status
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession
from redis import asyncio as redis

from app.core.db import get_session, get_session_factory
from app.core.redis_client import get_redis
from app.models import User
from app.core.security import read_session

# --- Dependencies (functions defined elsewhere) ---

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SessionFactoryDep = Annotated[
    async_sessionmaker[AsyncSession], Depends(get_session_factory)
]
RedisDep = Annotated[redis.Redis, Depends(get_redis)]


# --- Dependency logic ---
async def get_current_user(
    request: Request, session: SessionDep, redis: RedisDep
) -> User:
    """Signed-in user from the rl_session cookie, or 401.
    
        Unverified or no-longer-employed users also get 401, so clearing either flag
        locks them out on their next request. Reading the session renews its TTL, and
        every call stamps `last_activity_at` and commits.
    """

    sid = request.cookies.get("rl_session")
    if not sid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    user_id = await read_session(redis, sid)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired"
        )

    user = await session.get(User, user_id)
    if user is None or not user.is_verified or not user.is_currently_employed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Account unavailable"
        )

    user.last_activity_at = datetime.now(timezone.utc)
    session.add(user)
    await session.commit()

    return user


async def verify_csrf(request: Request) -> None:
    """Double-submit check: the X-CSRF-Token header must match the csrf_token cookie.
    
        403 if either is missing or they differ. Used on routes that change data.
    """

    cookie_token = request.cookies.get("csrf_token")
    header_token = request.headers.get("X-CSRF-Token")

    if not cookie_token or not header_token or cookie_token != header_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token missing or invalid",
        )


# --- Dependencies (defined here) ---

CurrentUser = Annotated[User, Depends(get_current_user)]
CSRFProtected = Depends(verify_csrf)


async def require_ingest(user: CurrentUser) -> User:
    """Current user if they may run ingest jobs and Apify runs, else 403."""

    if not (user.can_ingest or user.is_superadmin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not permitted to ingest",
            headers={"X-Error-Code": "forbidden"},
        )
    return user


async def require_edit(user: CurrentUser) -> User:
    """Current user if they may edit records, else 403."""

    if not (user.can_edit or user.is_superadmin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not permitted to edit",
            headers={"X-Error-Code": "forbidden"},
        )
    return user

async def require_superAdmin(user: CurrentUser) -> User:
    """Current user if they are a super admin, else 403."""

    if not user.is_superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a super admin",
            headers={"X-Error-Code": "forbidden"},
        )
    return user


async def require_admin(user: CurrentUser) -> User:
    """Current user if they are an admin or super admin, else 403."""

    if not (user.is_admin or user.is_superadmin): # admin or higher permission
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not an admin",
            headers={"X-Error-Code": "forbidden"},
        )
    return user


IngestUser = Annotated[User, Depends(require_ingest)]
EditUser = Annotated[User, Depends(require_edit)]
SuperAdminUser = Annotated[User, Depends(require_superAdmin)]
AdminUser = Annotated[User, Depends(require_admin)]
