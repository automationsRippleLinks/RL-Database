"""Edit locks: "<Name> is editing this campaign".

Opening an edit form claims the record for EDIT_LOCK_CACHE_TTL seconds; the form
renews the claim every minute while it stays open. Anyone else trying to open
or save the record meanwhile is told who has it. A closed computer simply stops
renewing, so a forgotten lock clears itself within two minutes.

A lock lives in Redis only -- it is a courtesy between people. not data. The
version check on save is what actually guarantees nothing is overwritten.
"""

from datetime import datetime, timedelta, UTC
from typing import Optional

from pydantic import BaseModel
from redis.asyncio import Redis

from app.core.config import settings


class LockHolder(BaseModel):
    user_id: int
    name: str
    since: datetime
    expires_at: datetime


def _key(kind: str, record_id: str) -> str:
    return f"{settings.EDIT_LOCK_CACHE_PREFIX}{kind}:{record_id}"


async def holder(redis: Redis, kind: str, record_id: str) -> Optional[LockHolder]:
    raw = await redis.get(_key(kind, record_id))
    return LockHolder.model_validate_json(raw) if raw else None


async def acquire(
    redis: Redis, kind: str, record_id: str, user_id: int, name: str
) -> tuple[bool, LockHolder]:
    """Claim or renew. Returns (True, our lock) or (False, whoever has it)."""
    key, ttl = _key(kind, record_id), settings.EDIT_LOCK_CACHE_TTL
    now = datetime.now(UTC)
    for _ in range(2):  # a lock can expire between the two calls; one retry covers it
        mine = LockHolder(
            user_id=user_id,
            name=name,
            since=now,
            expires_at=now + timedelta(seconds=ttl),
        )
        if await redis.set(key, mine.model_dump_json(), nx=True, ex=ttl):
            return True, mine
        current = await holder(redis, kind, record_id)
        if current is None:
            continue
        if current.user_id != user_id:
            return False, current
        mine.since = current.since  # renewing keep the original start time
        if await redis.set(key, mine.model_dump_json(), xx=True, ex=ttl):
            return True, mine
    raise RuntimeError(f"could not claim {key}")  # only under a rapid claim/expire race


async def release(
    redis: Redis, kind: str, record_id: str, user_id: int, force: bool = False
) -> bool:
    """Drop our own lock (or anyone's, with force). False if someone else holds it."""
    current = await holder(redis, kind, record_id)
    if current is None:
        return True
    if current.user_id != user_id and not force:
        return False
    await redis.delete(_key(kind, record_id))
    return True
