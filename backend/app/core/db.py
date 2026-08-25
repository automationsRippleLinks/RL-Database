from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.models import SQLModel

engine = create_async_engine(str(settings.DB_URL), echo=settings.DB_ECHO)
Session_Factory = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)

async def init_db(reset: bool = False) -> None:
    async with engine.begin() as conn:
        if reset:
            await conn.run_sync(SQLModel.metadata.drop_all)
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with Session_Factory() as session:
        yield session
