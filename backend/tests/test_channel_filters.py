import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from youtube_monitor.database import get_session
from youtube_monitor.main import app
from youtube_monitor.models.channel import Channel


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


async def _seed_channels(session):
    channels = [
        Channel(
            youtube_channel_id="UCmanualtag001",
            channel_name="TestChannel Alpha",
            source="manual",
            status="active",
            tags=["tag1", "tag2"],
        ),
        Channel(
            youtube_channel_id="UCmanualtag002",
            channel_name="Other Manual",
            source="manual",
            status="inactive",
            tags=["tag3"],
        ),
        Channel(
            youtube_channel_id="UCauto001",
            channel_name="Auto Channel",
            source="cofacts",
            status="active",
            tags=["tag2"],
        ),
    ]
    session.add_all(channels)
    await session.commit()


async def test_list_channels_filter_by_source_manual(api_client_with_session):
    client, session = api_client_with_session
    await _seed_channels(session)

    response = await client.get("/api/channels?source=manual")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert all(item["source"] == "manual" for item in data["items"])


async def test_list_channels_filter_by_source_nonexistent_returns_empty(
    api_client_with_session,
):
    client, session = api_client_with_session
    await _seed_channels(session)

    response = await client.get("/api/channels?source=nonexistent")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0


async def test_list_channels_filter_by_single_tag(api_client_with_session):
    client, session = api_client_with_session
    await _seed_channels(session)

    response = await client.get("/api/channels?tags=tag1")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert all("tag1" in (item["tags"] or []) for item in data["items"])


async def test_list_channels_filter_by_search_channel_name(api_client_with_session):
    client, session = api_client_with_session
    await _seed_channels(session)

    response = await client.get("/api/channels?search=TestChannel")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert all("TestChannel" in (item["channel_name"] or "") for item in data["items"])


async def test_list_channels_combined_status_and_source_filters(
    api_client_with_session,
):
    client, session = api_client_with_session
    await _seed_channels(session)

    response = await client.get("/api/channels?status=active&source=manual")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert all(
        item["status"] == "active" and item["source"] == "manual"
        for item in data["items"]
    )


async def test_get_channel_tags_returns_distinct_sorted_tags(api_client_with_session):
    client, session = api_client_with_session
    await _seed_channels(session)

    response = await client.get("/api/channels/tags")
    assert response.status_code == 200
    data = response.json()
    assert data == ["tag1", "tag2", "tag3"]
