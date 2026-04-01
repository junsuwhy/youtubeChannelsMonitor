import pytest
import httpx
from sqlalchemy.ext.asyncio import async_sessionmaker
from youtube_monitor.main import app
from youtube_monitor.database import get_session
from youtube_monitor.models.user import UserRole


def make_mock_user(role: UserRole, user_id: int = 99):
    async def _mock():
        from youtube_monitor.models.user import User
        return User(id=user_id, username="admin", hashed_password="x",
                    is_active=True, role=role)
    return _mock


@pytest.fixture
async def user_admin_client(test_engine):
    from youtube_monitor.auth.deps import get_current_user
    async_session = async_sessionmaker(test_engine, expire_on_commit=False)
    async def override_db():
        async with async_session() as s:
            yield s
    app.dependency_overrides[get_session] = override_db
    app.dependency_overrides[get_current_user] = make_mock_user(UserRole.user_admin, user_id=99)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
async def content_admin_client(test_engine):
    from youtube_monitor.auth.deps import get_current_user
    async_session = async_sessionmaker(test_engine, expire_on_commit=False)
    async def override_db():
        async with async_session() as s:
            yield s
    app.dependency_overrides[get_session] = override_db
    app.dependency_overrides[get_current_user] = make_mock_user(UserRole.content_admin, user_id=88)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c
    app.dependency_overrides.clear()


async def test_content_admin_cannot_list_users(content_admin_client):
    resp = await content_admin_client.get("/api/users")
    assert resp.status_code == 403


async def test_user_admin_can_list_users(user_admin_client):
    resp = await user_admin_client.get("/api/users")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_user_admin_can_create_user(user_admin_client):
    resp = await user_admin_client.post("/api/users", json={
        "username": "newuser",
        "password": "pass1234",
        "role": "content_admin",
    })
    assert resp.status_code == 201
    body = resp.json()
    assert body["username"] == "newuser"
    assert body["role"] == "content_admin"


async def test_user_admin_can_change_role(user_admin_client):
    create = await user_admin_client.post("/api/users", json={
        "username": "u2", "password": "pass1234", "role": "viewer"
    })
    uid = create.json()["id"]
    resp = await user_admin_client.patch(f"/api/users/{uid}", json={"role": "content_admin"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "content_admin"


async def test_cannot_deactivate_self(user_admin_client):
    """管理員不能停用自己（mock id=99）。"""
    resp = await user_admin_client.delete("/api/users/99")
    assert resp.status_code == 400
