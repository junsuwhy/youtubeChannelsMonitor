import pytest
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from youtube_monitor.auth.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from youtube_monitor.crud import user as user_crud
from youtube_monitor.main import app


@pytest.fixture
async def test_user(db_session):
    """Create a test user for auth tests."""
    return await user_crud.create_user(
        db_session, "testuser", "testpass123", "test@example.com"
    )


@pytest.fixture
async def auth_client(test_engine):
    """HTTP client with the app overriding DB dependency."""
    from youtube_monitor.database import get_session
    from sqlalchemy.ext.asyncio import async_sessionmaker

    async_session = async_sessionmaker(test_engine, expire_on_commit=False)

    async def override_get_session():
        async with async_session() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client

    app.dependency_overrides.clear()


async def test_password_hashing():
    """Verify password hash works correctly."""
    hashed = get_password_hash("mypassword")
    assert verify_password("mypassword", hashed)
    assert not verify_password("wrongpassword", hashed)


async def test_access_token_type():
    """Access token should have type='access'."""
    token = create_access_token({"sub": "testuser"})
    payload = decode_token(token)
    assert payload["type"] == "access"
    assert payload["sub"] == "testuser"


async def test_refresh_token_type():
    """Refresh token should have type='refresh'."""
    token = create_refresh_token({"sub": "testuser"})
    payload = decode_token(token)
    assert payload["type"] == "refresh"


async def test_login_success(auth_client, test_user):
    """POST /api/auth/login with correct credentials → 200, tokens returned."""
    response = await auth_client.post(
        "/api/auth/login",
        data={"username": "testuser", "password": "testpass123"},
    )
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"


async def test_login_wrong_password(auth_client, test_user):
    """POST /api/auth/login with wrong password → 401."""
    response = await auth_client.post(
        "/api/auth/login",
        data={"username": "testuser", "password": "wrongpass"},
    )
    assert response.status_code == 401


async def test_login_nonexistent_user(auth_client):
    """POST /api/auth/login with unknown user → 401."""
    response = await auth_client.post(
        "/api/auth/login",
        data={"username": "nobody", "password": "pass"},
    )
    assert response.status_code == 401


async def test_refresh_token_cannot_access_api(auth_client, test_user):
    """Refresh token MUST NOT be usable for protected API endpoints → 401."""
    # Login to get tokens
    login_response = await auth_client.post(
        "/api/auth/login",
        data={"username": "testuser", "password": "testpass123"},
    )
    refresh_token = login_response.json()["refresh_token"]

    # Try using refresh token to access protected endpoint
    response = await auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {refresh_token}"},
    )
    assert response.status_code == 401


async def test_refresh_endpoint_returns_new_access_token(auth_client, test_user):
    """POST /api/auth/refresh with valid refresh token → 200, new access_token."""
    login_response = await auth_client.post(
        "/api/auth/login",
        data={"username": "testuser", "password": "testpass123"},
    )
    refresh_token = login_response.json()["refresh_token"]

    response = await auth_client.post(
        "/api/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body


async def test_get_me_with_valid_token(auth_client, test_user):
    """GET /api/auth/me with valid access token → 200, user data."""
    login_response = await auth_client.post(
        "/api/auth/login",
        data={"username": "testuser", "password": "testpass123"},
    )
    access_token = login_response.json()["access_token"]

    response = await auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 200
    assert response.json()["username"] == "testuser"
