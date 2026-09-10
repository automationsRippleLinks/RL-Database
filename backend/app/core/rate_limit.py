from fastapi import HTTPException, status
from redis.asyncio import Redis as RedisClient

from app.core.config import settings

async def check_rate_limit(
        redis: RedisClient, scope: str, key: str, limit: int, window: int
) -> None:
    k = f"{settings.RATE_LIMIT_PREFIX}{scope}:{key}"
    hits = await redis.incr(k)
    if hits == 1:
        await redis.expire(k, window)
    if hits > limit:
        ttl = await redis.ttl(k)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts",
            headers={"Retry-After": str(max(ttl, 1)), "X-Error-Code": "rate_limited"}
        )