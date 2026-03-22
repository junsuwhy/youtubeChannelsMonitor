"""Tests for SQLAlchemy models."""

import datetime
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text

from youtube_monitor.models import Base, Channel
from youtube_monitor.models.base import Base as BaseClass
from sqlalchemy.ext.asyncio import AsyncAttrs


@pytest.fixture
async def engine():
    """Create an in-memory SQLite engine with StaticPool for tests."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def session(engine):
    """Create an async session for testing."""
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as sess:
        yield sess


async def test_channel_unique_constraint(session):
    """Inserting same youtube_channel_id twice should raise IntegrityError."""
    channel1 = Channel(
        youtube_channel_id="UC_test_channel_1",
        channel_name="Test Channel",
    )
    session.add(channel1)
    await session.commit()

    channel2 = Channel(
        youtube_channel_id="UC_test_channel_1",  # duplicate
        channel_name="Test Channel Duplicate",
    )
    session.add(channel2)
    with pytest.raises(IntegrityError):
        await session.commit()


async def test_channel_snapshot_upsert(session):
    """Insert same (channel_id, snapshot_date) twice using INSERT OR REPLACE → row count = 1."""
    # First create a channel
    channel = Channel(
        youtube_channel_id="UC_snap_test",
        channel_name="Snapshot Test Channel",
    )
    session.add(channel)
    await session.commit()
    await session.refresh(channel)

    snap_date = datetime.date(2026, 3, 20)

    # Insert first snapshot
    await session.execute(
        text(
            "INSERT OR REPLACE INTO channel_snapshots (channel_id, snapshot_date, subscriber_count) "
            "VALUES (:channel_id, :snapshot_date, :subscriber_count)"
        ),
        {
            "channel_id": channel.id,
            "snapshot_date": snap_date.isoformat(),
            "subscriber_count": 1000,
        },
    )
    await session.commit()

    # Insert same date again with updated count (upsert)
    await session.execute(
        text(
            "INSERT OR REPLACE INTO channel_snapshots (channel_id, snapshot_date, subscriber_count) "
            "VALUES (:channel_id, :snapshot_date, :subscriber_count)"
        ),
        {
            "channel_id": channel.id,
            "snapshot_date": snap_date.isoformat(),
            "subscriber_count": 2000,
        },
    )
    await session.commit()

    # Should have only 1 row for this channel+date
    result = await session.execute(
        text(
            "SELECT COUNT(*) FROM channel_snapshots WHERE channel_id = :channel_id AND snapshot_date = :snapshot_date"
        ),
        {"channel_id": channel.id, "snapshot_date": snap_date.isoformat()},
    )
    count = result.scalar()
    assert count == 1

    # Verify the latest value was kept
    result = await session.execute(
        text(
            "SELECT subscriber_count FROM channel_snapshots WHERE channel_id = :channel_id AND snapshot_date = :snapshot_date"
        ),
        {"channel_id": channel.id, "snapshot_date": snap_date.isoformat()},
    )
    subscriber_count = result.scalar()
    assert subscriber_count == 2000


async def test_json_field_roundtrip(session):
    """Set tags = ['健康謠言', '政治'], save/retrieve, assert tags == ['健康謠言', '政治']."""
    channel = Channel(
        youtube_channel_id="UC_json_test",
        channel_name="JSON Test Channel",
        tags=["健康謠言", "政治"],
    )
    session.add(channel)
    await session.commit()
    await session.refresh(channel)

    assert channel.tags == ["健康謠言", "政治"]


async def test_base_has_async_attrs():
    """Assert that Base inherits from AsyncAttrs."""
    assert issubclass(BaseClass, AsyncAttrs), "Base should inherit from AsyncAttrs"
