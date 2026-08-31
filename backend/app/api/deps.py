from typing import Annotated

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
SessionFactoryDep = Annotated[async_sessionmaker[AsyncSession], Depends(get_session_factory)]
RedisDep = Annotated[redis.Redis, Depends(get_redis)]


# --- Dependency logic ---
async def get_current_user(
    request: Request, session: SessionDep, redis: RedisDep
) -> User:
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

    return user

async def verify_csrf(request: Request) -> None:
    cookie_token = request.cookies.get("csrf_token")
    header_token = request.headers.get("X-CSRF-Token")

    if not cookie_token or not header_token or cookie_token != header_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token missing or invalid"
        )


# --- Dependencies (defined here) ---

CurrentUser = Annotated[User, Depends(get_current_user)]
CSRFProtected = Depends(verify_csrf)


async def require_ingest(user: CurrentUser) -> User:
    if not user.can_ingest:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not permitted to ingest",
            headers={"X-Error-Code": "forbidden"}
        )
    return user

IngestUser = Annotated[User, Depends(require_ingest)]