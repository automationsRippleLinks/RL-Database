"""Fixed-window rate limiting in Redis, for login, verification and password reset."""

from fastapi import HTTPException, status
from redis.asyncio import Redis as RedisClient

from app.core.config import settings


async def check_rate_limit(
    redis: RedisClient, scope: str, key: str, limit: int, window: int
) -> None:
    """Count one hit; 429 with Retry-After once `key` passes `limit` in `window` seconds.
    
    `scope` names the check (e.g. "login:ip") so the same key, such as an email,
    gets a separate counter per route. Attempts over the limit still count.
    """
    k = f"{settings.RATE_LIMIT_PREFIX}{scope}:{key}"
    hits = await redis.incr(k)
    # the first hit starts the window; later hits don't extend it
    if hits == 1:
        await redis.expire(k, window)
    if hits > limit:
        ttl = await redis.ttl(k)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts",
            headers={"Retry-After": str(max(ttl, 1)), "X-Error-Code": "rate_limited"},
        )
