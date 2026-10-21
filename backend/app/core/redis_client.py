"""Redis pool and client, shared by cache, sessions, rate limits and edit locks."""

from redis import asyncio as redis
from fastapi import Request

from app.core.config import settings

redis_pool: redis.ConnectionPool | None = None


def create_redis(pool: redis.ConnectionPool | None = None) -> redis.Redis:
    """Client on `pool`, or on a fresh pool of its own when none is given."""
    return redis.Redis(connection_pool=pool or create_redis_pool())


def create_redis_pool() -> redis.ConnectionPool:
    """Pool that returns str, not bytes (decode_responses), for every command."""
    return redis.ConnectionPool.from_url(
        str(settings.REDIS_URL),
        max_connections=settings.REDIS_MAX_CONNECTIONS,
        decode_responses=True,
    )


async def get_redis(request: Request) -> redis.Redis:
    """The app's shared Redis client, for route dependencies."""
    return request.app.state.redis
