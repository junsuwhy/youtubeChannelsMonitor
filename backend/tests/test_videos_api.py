import pytest
import httpx
from sqlalchemy.ext.asyncio import async_sessionmaker
from youtube_monitor.main import app
from youtube_monitor.database import get_session


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


async def test_list_videos_empty(api_client):
    """Empty DB returns empty video list."""
    response = await api_client.get("/api/videos")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0


async def test_list_videos_filter_by_channel(api_client, db_session):
    """?channel_id=N only returns that channel's videos."""
    from youtube_monitor.models.channel import Channel
    from youtube_monitor.models.video import Video

    ch = Channel(youtube_channel_id="UCvid_test_ch", channel_name="Test")
    db_session.add(ch)
    await db_session.commit()
    await db_session.refresh(ch)

    v1 = Video(youtube_video_id="vid1_test", channel_id=ch.id, title="V1")
    db_session.add(v1)
    await db_session.commit()

    response = await api_client.get(f"/api/videos?channel_id={ch.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert all(v["channel_id"] == ch.id for v in data["items"])


async def test_get_video_snapshots(api_client, db_session):
    """Snapshots returned in ascending date order."""
    import datetime
    from youtube_monitor.models.channel import Channel
    from youtube_monitor.models.video import Video
    from youtube_monitor.models.video_snapshot import VideoSnapshot

    ch = Channel(youtube_channel_id="UCsnap_test", channel_name="Snap Test")
    db_session.add(ch)
    await db_session.commit()
    await db_session.refresh(ch)

    v = Video(youtube_video_id="vidsnap1", channel_id=ch.id, title="Snap Video")
    db_session.add(v)
    await db_session.commit()
    await db_session.refresh(v)

    s1 = VideoSnapshot(
        video_id=v.id, snapshot_date=datetime.date(2026, 3, 1), view_count=100
    )
    s2 = VideoSnapshot(
        video_id=v.id, snapshot_date=datetime.date(2026, 3, 15), view_count=200
    )
    db_session.add_all([s1, s2])
    await db_session.commit()

    response = await api_client.get(f"/api/videos/{v.id}/snapshots")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["snapshot_date"] < data[1]["snapshot_date"]  # ASC order


async def test_stats_overview(api_client):
    """Stats overview returns required fields."""
    response = await api_client.get("/api/stats/overview")
    assert response.status_code == 200
    data = response.json()
    assert "total_channels" in data
    assert "total_videos" in data
    assert "new_videos_this_week" in data
    assert isinstance(data["total_channels"], int)
    assert isinstance(data["total_videos"], int)


async def test_channel_trend(api_client, db_session):
    """Channel trend returns date+subscriber_count series."""
    import datetime
    from youtube_monitor.models.channel import Channel
    from youtube_monitor.models.channel_snapshot import ChannelSnapshot

    ch = Channel(youtube_channel_id="UCtrend_test", channel_name="Trend Test")
    db_session.add(ch)
    await db_session.commit()
    await db_session.refresh(ch)

    snap = ChannelSnapshot(
        channel_id=ch.id,
        snapshot_date=datetime.date(2026, 3, 20),
        subscriber_count=1000,
    )
    db_session.add(snap)
    await db_session.commit()

    response = await api_client.get(f"/api/stats/channels/{ch.id}/trend")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert "date" in data[0]
    assert "subscriber_count" in data[0]
