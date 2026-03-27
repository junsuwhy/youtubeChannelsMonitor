import pytest
import datetime
import httpx
from sqlalchemy.ext.asyncio import async_sessionmaker
from youtube_monitor.main import app
from youtube_monitor.database import get_session
from youtube_monitor.models.channel import Channel
from youtube_monitor.models.video import Video
from youtube_monitor.models.video_snapshot import VideoSnapshot
from youtube_monitor.models.channel_snapshot import ChannelSnapshot


async def mock_current_user():
    from youtube_monitor.models.user import User

    return User(id=1, username="testuser", hashed_password="x", is_active=True)


@pytest.fixture
async def api_client(test_engine):
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

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
async def seeded_video_trending(db_session):
    """Two snapshots for the same video on consecutive dates."""
    channel = Channel(
        youtube_channel_id="UC_test_trending",
        channel_name="Test Chan",
        status="active",
        source="manual",
    )
    db_session.add(channel)
    await db_session.flush()

    video = Video(
        youtube_video_id="vid_trend_1",
        channel_id=channel.id,
        title="Trending Video",
        status="public",
    )
    db_session.add(video)
    await db_session.flush()

    today = datetime.date(2026, 3, 27)
    yesterday = datetime.date(2026, 3, 26)

    snap_yesterday = VideoSnapshot(
        video_id=video.id, snapshot_date=yesterday, view_count=1000
    )
    snap_today = VideoSnapshot(video_id=video.id, snapshot_date=today, view_count=5000)
    db_session.add_all([snap_yesterday, snap_today])
    await db_session.commit()

    return {"channel": channel, "video": video, "delta": 4000}


async def test_get_trending_videos_returns_delta(api_client, seeded_video_trending):
    resp = await api_client.get("/api/stats/videos/trending?limit=5")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["view_delta"] == seeded_video_trending["delta"]
    assert item["title"] == "Trending Video"
    assert item["channel_name"] == "Test Chan"
    assert "view_count" in item
    assert "thumbnail_url" in item


async def test_get_trending_videos_empty_when_no_snapshots(api_client):
    resp = await api_client.get("/api/stats/videos/trending?limit=5")
    assert resp.status_code == 200
    assert resp.json()["items"] == []


@pytest.fixture
async def seeded_channel_trending(db_session):
    channel = Channel(
        youtube_channel_id="UC_chan_trending",
        channel_name="Chan Trend",
        status="active",
        source="manual",
    )
    db_session.add(channel)
    await db_session.flush()

    today = datetime.date(2026, 3, 27)
    yesterday = datetime.date(2026, 3, 26)

    snap_yesterday = ChannelSnapshot(
        channel_id=channel.id,
        snapshot_date=yesterday,
        view_count=50000,
        subscriber_count=100,
    )
    snap_today = ChannelSnapshot(
        channel_id=channel.id,
        snapshot_date=today,
        view_count=80000,
        subscriber_count=105,
    )
    db_session.add_all([snap_yesterday, snap_today])
    await db_session.commit()

    return {"channel": channel, "delta": 30000}


async def test_get_trending_channels_returns_delta(api_client, seeded_channel_trending):
    resp = await api_client.get("/api/stats/channels/trending?limit=5")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["view_delta"] == seeded_channel_trending["delta"]
    assert item["channel_name"] == "Chan Trend"
    assert "view_count" in item
    assert "thumbnail_url" in item


async def test_get_trending_channels_empty_when_no_snapshots(api_client):
    resp = await api_client.get("/api/stats/channels/trending?limit=5")
    assert resp.status_code == 200
    assert resp.json()["items"] == []
