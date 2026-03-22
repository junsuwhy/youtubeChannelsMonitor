import datetime

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from youtube_monitor.database import get_session
from youtube_monitor.main import app
from youtube_monitor.models.channel import Channel
from youtube_monitor.models.fetch_log import FetchLog


async def mock_current_user():
    from youtube_monitor.models.user import User

    return User(id=1, username="testuser", hashed_password="x", is_active=True)


@pytest.fixture
async def api_client_with_session(test_engine):
    async_session = async_sessionmaker(test_engine, expire_on_commit=False)

    async def override_get_session():
        async with async_session() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    from youtube_monitor.auth.deps import get_current_user

    app.dependency_overrides[get_current_user] = mock_current_user

    session = async_session()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client, session

    await session.close()
    app.dependency_overrides.clear()


async def _seed_logs(session):
    ch1 = Channel(youtube_channel_id="UCfetchlog001", channel_name="FetchLog C1")
    ch2 = Channel(youtube_channel_id="UCfetchlog002", channel_name="FetchLog C2")
    session.add_all([ch1, ch2])
    await session.commit()
    await session.refresh(ch1)
    await session.refresh(ch2)

    now = datetime.datetime.now(datetime.timezone.utc)
    logs = [
        FetchLog(
            job_name="channel_snapshot",
            status="success",
            channels_processed=1,
            videos_processed=0,
            api_units_used=1,
            started_at=now,
            finished_at=now,
            channel_id=ch1.id,
        ),
        FetchLog(
            job_name="discover_videos",
            status="success",
            channels_processed=1,
            videos_processed=2,
            api_units_used=2,
            started_at=now,
            finished_at=now,
            channel_id=ch1.id,
        ),
        FetchLog(
            job_name="video_snapshot",
            status="success",
            channels_processed=1,
            videos_processed=3,
            api_units_used=3,
            started_at=now,
            finished_at=now,
            channel_id=ch2.id,
        ),
    ]
    session.add_all(logs)
    await session.commit()
    return ch1.id, ch2.id


async def test_system_logs_without_channel_filter_returns_all(api_client_with_session):
    client, session = api_client_with_session
    await _seed_logs(session)

    response = await client.get("/api/system/logs")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    job_names = {item["job_name"] for item in data["items"]}
    assert job_names == {"channel_snapshot", "discover_videos", "video_snapshot"}


async def test_system_logs_filter_by_channel_id(api_client_with_session):
    client, session = api_client_with_session
    ch1_id, _ = await _seed_logs(session)

    response = await client.get(f"/api/system/logs?channel_id={ch1_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    job_names = {item["job_name"] for item in data["items"]}
    assert job_names == {"channel_snapshot", "discover_videos"}


async def test_system_logs_filter_by_nonexistent_channel_returns_empty(
    api_client_with_session,
):
    client, session = api_client_with_session
    await _seed_logs(session)

    response = await client.get("/api/system/logs?channel_id=9999")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0
