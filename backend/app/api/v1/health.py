"""Health checks for Redis and Postgres; 503 when the service can't be reached."""

import logging

from fastapi import APIRouter, HTTPException, status
from sqlmodel import text

from app.api.deps import RedisDep, SessionDep

log = logging.getLogger(__name__)
router = APIRouter()


@router.get("/redis")
async def redis_health(r: RedisDep):
    """Ping Redis. No sign-in needed."""
    try:
        pong = await r.ping()
        return {"service": "redis", "status": "up" if pong else "down"}
    except Exception:
        log.exception("Redis health check failed!")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="redis is down!",
        )


@router.get("/postgresdb")
async def db_health(session: SessionDep):
    """Run SELECT 1 against Postgres. No sign-in needed."""
    try:
        result = await session.exec(text("SELECT 1"))
        result.first()

        return {
            "service": "postgres",
            "status": "up",
        }
    except Exception:
        log.exception("Database health check failed!")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="database connection failed!",
        )
