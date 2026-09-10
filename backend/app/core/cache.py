from typing import Any, Callable, Awaitable
import json
import hashlib

from pydantic import BaseModel
from redis.asyncio import Redis as RedisClient

from app.core.config import settings

def _canonical(payload: Any) -> str:
    if isinstance(payload, BaseModel):
        payload = payload.model_dump(mode="json")
    if isinstance(payload, dict):
        payload = {
            k: (sorted(v) if isinstance(v, list) else v) for k, v in payload.items()
        }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def cache_key(prefix: str, payload: Any = None) -> str:
    if payload is None:
        return f"{prefix}{settings.REDIS_CACHE_VERSION}"
    digest = hashlib.sha256(_canonical(payload).encode()).hexdigest()[:16]
    return f"{prefix}{settings.REDIS_CACHE_VERSION}:{digest}"


async def cached(
    redis: RedisClient, key: str, ttl: int, produce: Callable[[], Awaitable[Any]]
) -> Any:
    try:
        hit = await redis.get(key) # try searching redis
        if hit is not None:
            return json.loads(hit)
    except Exception:
        pass

    value = await produce() # key not in redis, execute product a.k.a route code

    try:
        # try setting the new cache
        payload = (
            value.model_dump(mode="json") if isinstance(value, BaseModel) else value
        )
        await redis.setex(key, ttl, json.dumps(payload, default=str)) 
    except Exception:
        pass
    return value


async def invalidate(redis: RedisClient, *prefixes: str) -> int:
    removed = 0
    for prefix in prefixes:
        cursor = 0
        while True:
            cursor, keys = await redis.scan(
                cursor=cursor, match=f"{prefix}*", count=500
            )
            if keys:
                removed += await redis.delete(*keys)
            if cursor == 0:
                break
    return removed
