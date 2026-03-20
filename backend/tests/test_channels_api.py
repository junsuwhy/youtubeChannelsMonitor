import pytest
import httpx
from youtube_monitor.main import app
from youtube_monitor.database import get_session
from sqlalchemy.ext.asyncio import async_sessionmaker


# Override auth for testing
async def mock_current_user():
    """Mock authenticated user — bypasses JWT validation for tests."""
    from youtube_monitor.models.user import User

    user = User(id=1, username="testuser", hashed_password="x", is_active=True)
    return user


@pytest.fixture
async def api_client(test_engine):
    """HTTP client with DB and auth overrides."""
    async_session = async_sessionmaker(test_engine, expire_on_commit=False)

    async def override_get_session():
        async with async_session() as session:
            yield session

    # Override both DB and auth
    app.dependency_overrides[get_session] = override_get_session

    # Import and override auth dep
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


async def test_list_channels_empty(api_client):
    """Empty DB returns empty list."""
    response = await api_client.get("/api/channels")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0


async def test_create_channel_success(api_client):
    """POST /api/channels → 201, returns id."""
    response = await api_client.post(
        "/api/channels",
        json={"youtube_channel_id": "UCtest123", "channel_name": "Test Channel"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["id"] is not None
    assert data["youtube_channel_id"] == "UCtest123"
    assert data["status"] == "active"


async def test_create_channel_duplicate_409(api_client):
    """Duplicate youtube_channel_id → 409."""
    await api_client.post("/api/channels", json={"youtube_channel_id": "UCdup1"})
    response = await api_client.post(
        "/api/channels", json={"youtube_channel_id": "UCdup1"}
    )
    assert response.status_code == 409


async def test_list_channels_filter_by_status(api_client):
    """?status=active only returns active channels."""
    await api_client.post("/api/channels", json={"youtube_channel_id": "UCactive1"})
    await api_client.post("/api/channels", json={"youtube_channel_id": "UCdelete1"})
    # Soft delete the second
    list_resp = await api_client.get("/api/channels")
    channels = list_resp.json()["items"]
    second_id = next(
        c["id"] for c in channels if c["youtube_channel_id"] == "UCdelete1"
    )
    await api_client.delete(f"/api/channels/{second_id}")

    active_resp = await api_client.get("/api/channels?status=active")
    active_channels = active_resp.json()["items"]
    assert all(c["status"] == "active" for c in active_channels)


async def test_get_channel_not_found(api_client):
    """Non-existent ID → 404."""
    response = await api_client.get("/api/channels/99999")
    assert response.status_code == 404


async def test_soft_delete_channel(api_client):
    """DELETE sets status=inactive, row still exists."""
    create_resp = await api_client.post(
        "/api/channels",
        json={"youtube_channel_id": "UCdelete2", "channel_name": "To Delete"},
    )
    channel_id = create_resp.json()["id"]

    delete_resp = await api_client.delete(f"/api/channels/{channel_id}")
    assert delete_resp.status_code == 204

    # Verify it's still there with status=inactive
    get_resp = await api_client.get(f"/api/channels/{channel_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["status"] == "inactive"
