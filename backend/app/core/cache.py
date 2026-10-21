"""Read-through Redis cache for search, suggest and facet responses.

Keys look like `<prefix><REDIS_CACHE_VERSION>[:<hash of the request>]`, so bumping
the version orphans every old entry. Redis being down never fails a cached read:
the cache is skipped and the route runs as normal.
"""


from typing import Any, Callable, Awaitable
import json
import hashlib

from pydantic import BaseModel
from redis.asyncio import Redis as RedisClient

from app.core.config import settings

def _canonical(payload: Any) -> str:
    """Stable JSON for hashing: keys sorted, and top-level list values sorted too.
    
    Sorting the lists treats them as sets, so ["a", "b"] and ["b", "a"] share a key.
    """
    if isinstance(payload, BaseModel):
        payload = payload.model_dump(mode="json")
    if isinstance(payload, dict):
        payload = {
            k: (sorted(v) if isinstance(v, list) else v) for k, v in payload.items()
        }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def cache_key(prefix: str, payload: Any = None) -> str:
    """Versioned key for `prefix`, plus a short hash of `payload` when one is given."""
    if payload is None:
        return f"{prefix}{settings.REDIS_CACHE_VERSION}"
    digest = hashlib.sha256(_canonical(payload).encode()).hexdigest()[:16]
    return f"{prefix}{settings.REDIS_CACHE_VERSION}:{digest}"


async def cached(
    redis: RedisClient, key: str, ttl: int, produce: Callable[[], Awaitable[Any]]
) -> Any:
    """Cached value of `key`, or run `produce()` and cache it for `ttl` seconds.

    A hit comes back as decoded JSON (dicts and lists), not as the original
    Pydantic model, so callers must be fine with either. Redis errors are ignored.
    """
    try:
        hit = await redis.get(key) # try searching redis
        if hit is not None:
            return json.loads(hit)
    except Exception:
        pass

    value = await produce() # key not in redis, execute produce a.k.a route code

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
    """Delete every key under each prefix (all versions). Returns how many got removed.
    
    Uses SCAN rather than KEYS so a large keyspace doesn't block Redis.
    """
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
