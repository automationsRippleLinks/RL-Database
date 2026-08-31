from typing import AsyncGenerator, Optional

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncEngine
from sqlmodel.ext.asyncio.session import AsyncSession
from fastapi import Request

from app.core.config import settings
from app.models import SQLModel


def create_engine() -> AsyncEngine:
    return create_async_engine(
        str(settings.DB_URL),
        echo=settings.DB_ECHO,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_timeout=settings.DB_POOL_TIMEOUT,
        pool_recycle=settings.DB_POOL_RECYCLE,
        pool_pre_ping=settings.DB_POOL_PRE_PING,
    )


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def init_db(engine: AsyncEngine, reset: bool = False) -> None:
    async with engine.begin() as conn:
        if reset:
            await conn.run_sync(SQLModel.metadata.drop_all)
        await conn.run_sync(SQLModel.metadata.create_all)


def get_session_factory(request: Request) -> async_sessionmaker[AsyncSession]:
    """get session_factory for the route handler from app state"""
    return request.app.state.session_factory


async def get_session(request: Request) -> AsyncGenerator[AsyncSession, None]:
    """get session for the route handler from state"""
    async with request.app.state.session_factory() as session:
        yield session


# CLI (not used yet, but will be needed by pytest in future)-----------------------------------

_cli_engine: Optional[AsyncEngine] = None
_cli_factory: Optional[async_sessionmaker[AsyncSession]] = None


def cli_session_factory() -> async_sessionmaker[AsyncSession]:
    """
    create session_factory, engine for the standalone script, 
    as those scripts don't have FastAPI 'app' which owns the engine and factory
    """
    global _cli_engine, _cli_factory
    if _cli_factory is None:
        _cli_engine = create_engine()
        _cli_factory = create_session_factory(_cli_engine)
    return _cli_factory


async def dispose_cli_engine() -> None:
    """Close the individual session and engine made to the standalone script"""
    global _cli_engine, _cli_factory
    if _cli_engine is not None:
        await _cli_engine.dispose()
    _cli_engine, _cli_factory = None, None
