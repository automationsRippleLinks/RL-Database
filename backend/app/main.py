from app import observability

observability.setup("ripple-pulse-api")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.cache import invalidate
from app.core.db import create_engine, create_session_factory
from app.core.redis_client import create_redis, create_redis_pool
from app.api.v1 import router as v1_router
from app.worker import broker

CACHE_REFRESH_PREFIX_LIST = [
    settings.FACETS_CACHE_PREFIX,
    settings.SEARCH_CACHE_PREFIX,
    settings.SUGGEST_CACHE_PREFIX,
    settings.RATE_LIMIT_PREFIX,
]


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
        observability.instrument_clients(engine=engine, redis=app.state.redis)
        await app.state.redis.ping()  # check if redis is alive
        await invalidate(app.state.redis, *CACHE_REFRESH_PREFIX_LIST)  # refresh cache
        await broker.startup()
        yield
    finally:
        await broker.shutdown()
        try:
            await app.state.redis.aclose()
            await redis_pool.aclose()
        finally:
            await engine.dispose()
            observability.shutdown()


app = FastAPI(
    lifespan=lifespan,
    title=f"Ripple Pulse {settings.ENVIRONMENT}",
    version=settings.API_VERSION,
    root_path=settings.API_ROOT_PATH,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS", "DELETE"],
    allow_headers=["Content-Type", "Accept", "X-CSRF-Token"],
    expose_headers=["X-Error-Code", "Retry-After"],
)


app.include_router(v1_router)
observability.instrument_app(app=app)


@app.get("/home")
async def home_route():
    return {"message": "Connected to RL Database backend!!"}
