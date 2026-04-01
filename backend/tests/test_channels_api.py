import pytest
import httpx
from youtube_monitor.main import app
from youtube_monitor.database import get_session
from sqlalchemy.ext.asyncio import async_sessionmaker
from youtube_monitor.models.user import UserRole


# Override auth for testing
async def mock_current_user():
    """Mock authenticated user — bypasses JWT validation for tests."""
    from youtube_monitor.models.user import User

    user = User(id=1, username="testuser", hashed_password="x", is_active=True, role=UserRole.user_admin)
    return user


def make_mock_user(role: UserRole):
    async def _mock():
        from youtube_monitor.models.user import User
        return User(id=1, username="testuser", hashed_password="x",
                    is_active=True, role=role)
    return _mock


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
    from youtube_monitor.auth.deps import get_current_user
    app.dependency_overrides[get_current_user] = mock_current_user

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
async def viewer_client(test_engine):
    """viewer 角色的 HTTP client。"""
    from youtube_monitor.auth.deps import get_current_user
    async_session = async_sessionmaker(test_engine, expire_on_commit=False)
    async def override_db():
        async with async_session() as s:
            yield s
    app.dependency_overrides[get_session] = override_db
    app.dependency_overrides[get_current_user] = make_mock_user(UserRole.viewer)
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


# ── Fetch Now endpoint tests ──────────────────────────────────────────────────


async def test_fetch_channel_now_not_found(api_client):
    """POST /channels/99999/fetch → 404 for non-existent channel."""
    response = await api_client.post("/api/channels/99999/fetch")
    assert response.status_code == 404


async def test_fetch_channel_now_inactive_404(api_client):
    """POST /channels/{id}/fetch → 404 for inactive channel."""
    create_resp = await api_client.post(
        "/api/channels", json={"youtube_channel_id": "UCinactive_fetch"}
    )
    assert create_resp.status_code == 201
    channel_id = create_resp.json()["id"]
    await api_client.delete(f"/api/channels/{channel_id}")  # soft-delete → inactive

    response = await api_client.post(f"/api/channels/{channel_id}/fetch")
    assert response.status_code == 404


async def test_fetch_channel_now_quota_exhausted_429(api_client, test_engine):
    """POST /channels/{id}/fetch → 429 when remaining quota == 0."""
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from youtube_monitor.models.fetch_log import FetchLog
    from datetime import datetime, timezone

    # Create channel
    create_resp = await api_client.post(
        "/api/channels", json={"youtube_channel_id": "UCquota_test_fetch"}
    )
    assert create_resp.status_code == 201
    channel_id = create_resp.json()["id"]

    # Exhaust quota by inserting a FetchLog that uses all 10000 units
    async_session = async_sessionmaker(test_engine, expire_on_commit=False)
    async with async_session() as session:
        log = FetchLog(
            job_name="manual",
            status="success",
            channels_processed=0,
            videos_processed=0,
            api_units_used=10000,
            error_message=None,
            started_at=datetime.now(timezone.utc),
            finished_at=datetime.now(timezone.utc),
        )
        session.add(log)
        await session.commit()

    response = await api_client.post(f"/api/channels/{channel_id}/fetch")
    assert response.status_code == 429


async def test_fetch_channel_now_success(api_client):
    """POST /channels/{id}/fetch → 200 with correct response shape (mocked jobs)."""
    from unittest.mock import AsyncMock, patch

    create_resp = await api_client.post(
        "/api/channels", json={"youtube_channel_id": "UCsuccess_fetch"}
    )
    assert create_resp.status_code == 201
    channel_id = create_resp.json()["id"]

    mock_result = {"status": "success", "channels_processed": 1, "api_units_used": 1}
    with (
        patch(
            "youtube_monitor.api.channels.run_channel_snapshot_job",
            new_callable=AsyncMock,
            return_value=mock_result,
        ) as mock_snap,
        patch(
            "youtube_monitor.api.channels.run_discover_videos_job",
            new_callable=AsyncMock,
            return_value={
                "status": "success",
                "videos_processed": 0,
                "api_units_used": 1,
            },
        ),
        patch(
            "youtube_monitor.api.channels.run_video_snapshot_job",
            new_callable=AsyncMock,
            return_value={
                "status": "success",
                "videos_processed": 0,
                "api_units_used": 1,
            },
        ),
        patch("youtube_monitor.api.channels.YouTubeClient"),
    ):
        response = await api_client.post(f"/api/channels/{channel_id}/fetch")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["channel_id"] == channel_id
    assert "channel_status" in data
    assert "results" in data
    assert "channel_snapshot" in data["results"]
    assert "discover_videos" in data["results"]
    assert "video_snapshot" in data["results"]
    mock_snap.assert_called_once()


async def test_fetch_channel_now_youtube_api_error_502(api_client):
    """POST /channels/{id}/fetch → 502 when YouTube API returns an error (e.g. invalid key)."""
    from unittest.mock import AsyncMock, patch
    from googleapiclient.errors import HttpError
    from unittest.mock import MagicMock

    create_resp = await api_client.post(
        "/api/channels", json={"youtube_channel_id": "UCapi_error_test"}
    )
    assert create_resp.status_code == 201
    channel_id = create_resp.json()["id"]

    # Simulate YouTube API 400 error (e.g. invalid API key)
    fake_resp = MagicMock()
    fake_resp.status = 400
    fake_resp.reason = "Bad Request"
    fake_error = HttpError(resp=fake_resp, content=b"API key not valid")
    fake_error.reason = "API key not valid. Please pass a valid API key."

    with (
        patch("youtube_monitor.api.channels.YouTubeClient"),
        patch(
            "youtube_monitor.api.channels.run_channel_snapshot_job",
            new_callable=AsyncMock,
            side_effect=fake_error,
        ),
    ):
        response = await api_client.post(f"/api/channels/{channel_id}/fetch")

    assert response.status_code == 502
    assert "YouTube API error" in response.json()["detail"]


async def test_viewer_cannot_create_channel(viewer_client):
    """viewer 呼叫 POST /channels → 403。"""
    resp = await viewer_client.post(
        "/api/channels",
        json={"youtube_channel_id": "UCviewer", "channel_name": "Viewer Test"},
    )
    assert resp.status_code == 403


async def test_viewer_cannot_patch_channel(viewer_client, test_engine):
    """viewer 呼叫 PATCH /channels/{id} → 403。"""
    from youtube_monitor.models.channel import Channel
    async_session = async_sessionmaker(test_engine, expire_on_commit=False)
    async with async_session() as s:
        ch = Channel(youtube_channel_id="UCpatch", channel_name="Patch Test", status="active")
        s.add(ch)
        await s.commit()
        await s.refresh(ch)
        channel_id = ch.id
    resp = await viewer_client.patch(
        f"/api/channels/{channel_id}",
        json={"channel_name": "Updated"},
    )
    assert resp.status_code == 403


async def test_viewer_cannot_delete_channel(viewer_client, test_engine):
    """viewer 呼叫 DELETE /channels/{id} → 403。"""
    from youtube_monitor.models.channel import Channel
    async_session = async_sessionmaker(test_engine, expire_on_commit=False)
    async with async_session() as s:
        ch = Channel(youtube_channel_id="UCdel403", channel_name="Delete Test", status="active")
        s.add(ch)
        await s.commit()
        await s.refresh(ch)
        channel_id = ch.id
    resp = await viewer_client.delete(f"/api/channels/{channel_id}")
    assert resp.status_code == 403
