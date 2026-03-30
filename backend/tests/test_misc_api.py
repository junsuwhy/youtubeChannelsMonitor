import datetime
import pytest
import httpx
from sqlalchemy.ext.asyncio import async_sessionmaker

from youtube_monitor.main import app
from youtube_monitor.database import get_session
from youtube_monitor.models.fetch_log import FetchLog
from youtube_monitor.models.channel import Channel
from youtube_monitor.models.video import Video


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
    try:
        from youtube_monitor.auth.deps import get_current_user

        app.dependency_overrides[get_current_user] = mock_current_user
    except ImportError:
        pass

    session = async_session()

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client, session

    await session.close()
    app.dependency_overrides.clear()


async def test_quota_daily_gap_filling(api_client_with_session):
    client, session = api_client_with_session
    five_days_ago = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(
        days=5
    )

    log = FetchLog(
        job_name="channel_snapshot",
        status="success",
        api_units_used=100,
        started_at=five_days_ago,
    )
    session.add(log)
    await session.commit()

    response = await client.get("/api/misc/quota/daily?days=7")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 7

    today = datetime.date.today()
    target_date = (today - datetime.timedelta(days=5)).isoformat()
    day_values = {item["date"]: item["value"] for item in data["items"]}

    assert day_values[target_date] == 100
    for item in data["items"]:
        if item["date"] != target_date:
            assert item["value"] == 0


async def test_quota_daily_empty_db(api_client_with_session):
    client, session = api_client_with_session

    response = await client.get("/api/misc/quota/daily?days=3")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 3
    for item in data["items"]:
        assert item["value"] == 0


async def test_channels_daily_gap_filling(api_client_with_session):
    client, session = api_client_with_session
    two_days_ago = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(
        days=2
    )

    channel = Channel(
        youtube_channel_id="UC_gap_fill_test",
        source="manual",
        created_at=two_days_ago,
    )
    session.add(channel)
    await session.commit()

    response = await client.get("/api/misc/channels/daily-additions?days=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 5

    today = datetime.date.today()
    target_date = (today - datetime.timedelta(days=2)).isoformat()
    day_values = {item["date"]: item["value"] for item in data["items"]}

    assert day_values[target_date] == 1
    for item in data["items"]:
        if item["date"] != target_date:
            assert item["value"] == 0


async def test_channels_daily_only_manual(api_client_with_session):
    client, session = api_client_with_session
    one_day_ago = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(
        days=1
    )

    channel = Channel(
        youtube_channel_id="UC_cofacts_test",
        source="cofacts",
        created_at=one_day_ago,
    )
    session.add(channel)
    await session.commit()

    response = await client.get("/api/misc/channels/daily-additions?days=3")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 3

    today = datetime.date.today()
    target_date = (today - datetime.timedelta(days=1)).isoformat()
    day_values = {item["date"]: item["value"] for item in data["items"]}

    assert day_values[target_date] == 0


async def test_videos_daily_gap_filling(api_client_with_session):
    client, session = api_client_with_session
    today_dt = datetime.datetime.now(datetime.timezone.utc)

    channel = Channel(youtube_channel_id="UC_video_test", source="manual")
    session.add(channel)
    await session.flush()

    video1 = Video(
        youtube_video_id="vid_test_001",
        channel_id=channel.id,
        status="public",
        created_at=today_dt,
    )
    video2 = Video(
        youtube_video_id="vid_test_002",
        channel_id=channel.id,
        status="public",
        created_at=today_dt,
    )
    session.add(video1)
    session.add(video2)
    await session.commit()

    response = await client.get("/api/misc/videos/daily-new?days=3")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 3

    today_iso = datetime.date.today().isoformat()
    day_values = {item["date"]: item["value"] for item in data["items"]}
    assert day_values[today_iso] == 2
