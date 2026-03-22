import datetime

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from youtube_monitor.database import get_session
from youtube_monitor.main import app
from youtube_monitor.models.channel import Channel
from youtube_monitor.models.video import Video
from youtube_monitor.models.video_snapshot import VideoSnapshot


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


async def _seed_videos(session):
    ch = Channel(youtube_channel_id="UCvideofilters001", channel_name="Video Filters")
    session.add(ch)
    await session.commit()
    await session.refresh(ch)

    v_public = Video(
        youtube_video_id="vidpublic01",
        channel_id=ch.id,
        title="test public title",
        status="public",
        published_at=datetime.datetime(2026, 1, 10, 8, 0, 0),
    )
    v_deleted = Video(
        youtube_video_id="viddelete01",
        channel_id=ch.id,
        title="deleted sample",
        status="deleted",
        published_at=datetime.datetime(2026, 2, 10, 8, 0, 0),
    )
    v_private = Video(
        youtube_video_id="vidprivate1",
        channel_id=ch.id,
        title="private sample",
        status="private",
        published_at=datetime.datetime(2026, 3, 10, 8, 0, 0),
    )
    session.add_all([v_public, v_deleted, v_private])
    await session.commit()
    await session.refresh(v_public)
    await session.refresh(v_deleted)

    session.add_all(
        [
            VideoSnapshot(
                video_id=v_public.id,
                snapshot_date=datetime.date(2026, 3, 20),
                view_count=100,
                like_count=5,
                comment_count=1,
            ),
            VideoSnapshot(
                video_id=v_deleted.id,
                snapshot_date=datetime.date(2026, 3, 20),
                view_count=500,
                like_count=8,
                comment_count=2,
            ),
        ]
    )
    await session.commit()


async def test_list_videos_default_returns_only_public(api_client_with_session):
    client, session = api_client_with_session
    await _seed_videos(session)

    response = await client.get("/api/videos")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert all(item["status"] == "public" for item in data["items"])


async def test_list_videos_filter_by_title(api_client_with_session):
    client, session = api_client_with_session
    await _seed_videos(session)

    response = await client.get("/api/videos?title=test")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert all("test" in (item["title"] or "").lower() for item in data["items"])


async def test_list_videos_include_non_public_with_deleted_status(
    api_client_with_session,
):
    client, session = api_client_with_session
    await _seed_videos(session)

    response = await client.get("/api/videos?include_non_public=true&status=deleted")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert all(item["status"] == "deleted" for item in data["items"])


async def test_list_videos_filter_by_published_after(api_client_with_session):
    client, session = api_client_with_session
    await _seed_videos(session)

    response = await client.get("/api/videos?published_after=2026-02-01")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []


async def test_list_videos_sort_by_view_count_response_shape(api_client_with_session):
    client, session = api_client_with_session
    await _seed_videos(session)

    response = await client.get("/api/videos?sort_by=view_count")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "limit" in data
