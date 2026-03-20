"""Tests for SQLite async engine configuration."""

import pytest
import tempfile
import os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool, NullPool
from sqlalchemy import event

from youtube_monitor.database import set_sqlite_pragmas
from youtube_monitor.models.base import Base
from youtube_monitor.models.channel import Channel


@pytest.fixture
async def mem_engine():
    """Fresh in-memory engine for these tests."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    event.listen(engine.sync_engine, "connect", set_sqlite_pragmas)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def mem_session(mem_engine):
    factory = async_sessionmaker(mem_engine, expire_on_commit=False)
    async with factory() as session:
        yield session


async def test_wal_mode_enabled():
    """PRAGMA journal_mode=WAL works on file-based SQLite."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        engine = create_async_engine(
            f"sqlite+aiosqlite:///{db_path}",
            poolclass=NullPool,
        )
        event.listen(engine.sync_engine, "connect", set_sqlite_pragmas)
        async with engine.connect() as conn:
            result = await conn.execute(text("PRAGMA journal_mode"))
            mode = result.scalar()
        await engine.dispose()
        assert mode == "wal", f"Expected WAL mode, got: {mode}"
    finally:
        os.unlink(db_path)


async def test_foreign_keys_enabled(mem_session):
    """PRAGMA foreign_keys should return 1."""
    result = await mem_session.execute(text("PRAGMA foreign_keys"))
    fk = result.scalar()
    assert fk == 1, f"Expected foreign_keys=1, got: {fk}"


async def test_no_missing_greenlet(mem_session):
    """After commit, accessing attributes should not raise MissingGreenlet.
    This tests that expire_on_commit=False is set correctly."""
    channel = Channel(
        youtube_channel_id="UC_greenlet_test",
        channel_name="Greenlet Test",
    )
    mem_session.add(channel)
    await mem_session.commit()
    # With expire_on_commit=True this would raise MissingGreenlet
    # With expire_on_commit=False this should work fine
    assert channel.youtube_channel_id == "UC_greenlet_test"
    assert channel.id is not None
