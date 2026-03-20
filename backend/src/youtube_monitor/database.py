from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool, StaticPool
from sqlalchemy import event
from typing import AsyncGenerator

from youtube_monitor.config import settings


def _get_engine_kwargs(url: str) -> dict:
    """NullPool for file-based SQLite; StaticPool for in-memory (tests)."""
    if ":memory:" in url:
        return {"poolclass": StaticPool, "connect_args": {"check_same_thread": False}}
    return {"poolclass": NullPool}


engine = create_async_engine(
    settings.database_url, **_get_engine_kwargs(settings.database_url)
)


def set_sqlite_pragmas(dbapi_conn, connection_record):
    """Set SQLite pragmas on every new connection."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


event.listen(engine.sync_engine, "connect", set_sqlite_pragmas)

# expire_on_commit=False is MANDATORY for async sessions
# If True (default), accessing attributes after commit raises MissingGreenlet
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
