from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings, CACHE_REFRESH_PREFIX_LIST
from app.core.cache import invalidate
from app.core.db import create_engine, create_session_factory
from app.core.redis_client import create_redis, create_redis_pool
from app.api.v1 import router as v1_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    lifespan will now make the session_factory, engine and redis connection pool
    so that those connections live and die with the lifespan, rather than lingering around
    """
    engine = (
        create_engine()
    )  # create pg pool of connections and let engine own and hand them out
    redis_pool = (
        create_redis_pool()
    )  # create redis connection pool to pick connections from

    app.state.engine = engine
    app.state.session_factory = create_session_factory(
        engine
    )  # builds sessions; each uses and returns connection to pool when done with the session
    app.state.redis_pool = redis_pool
    app.state.redis = create_redis(
        redis_pool
    )  # redis client sharing the pool; each uses and returns connection when done with command/function
    try:
        async with engine.connect():
            pass
        await app.state.redis.ping()
        await invalidate(app.state.redis, *CACHE_REFRESH_PREFIX_LIST)  # refresh cache
        yield
    finally:
        try:
            await app.state.redis.aclose()
            await redis_pool.aclose()
        finally:
            await engine.dispose()


app = FastAPI(
    lifespan=lifespan,
    title=f"Ripple Pulse {settings.ENVIRONMENT}",
    version="0.1.0",
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS", "DELETE"],
    allow_headers=["Content-Type", "Accept", "X-CSRF-Token"],
    expose_headers=["X-Error-Code", "Retry-After"],
)


app.include_router(v1_router, prefix="/api/v1")


@app.get("/api/home")
async def home_route():
    return {"message": "Connected to RL Database backend!!"}
