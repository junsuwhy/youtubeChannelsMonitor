import pytest
from fastapi import HTTPException
from youtube_monitor.models.user import User, UserRole


def make_user(role: UserRole) -> User:
    return User(id=1, username="u", hashed_password="x", is_active=True, role=role)


async def test_content_admin_allows_content_admin():
    from youtube_monitor.auth.deps import require_content_admin
    user = make_user(UserRole.content_admin)
    result = await require_content_admin(user)
    assert result.username == "u"


async def test_content_admin_allows_user_admin():
    from youtube_monitor.auth.deps import require_content_admin
    user = make_user(UserRole.user_admin)
    result = await require_content_admin(user)
    assert result.username == "u"


async def test_content_admin_blocks_viewer():
    from youtube_monitor.auth.deps import require_content_admin
    user = make_user(UserRole.viewer)
    with pytest.raises(HTTPException) as exc:
        await require_content_admin(user)
    assert exc.value.status_code == 403


async def test_user_admin_allows_user_admin():
    from youtube_monitor.auth.deps import require_user_admin
    user = make_user(UserRole.user_admin)
    result = await require_user_admin(user)
    assert result.username == "u"


async def test_user_admin_blocks_content_admin():
    from youtube_monitor.auth.deps import require_user_admin
    user = make_user(UserRole.content_admin)
    with pytest.raises(HTTPException) as exc:
        await require_user_admin(user)
    assert exc.value.status_code == 403


async def test_user_admin_blocks_viewer():
    from youtube_monitor.auth.deps import require_user_admin
    user = make_user(UserRole.viewer)
    with pytest.raises(HTTPException) as exc:
        await require_user_admin(user)
    assert exc.value.status_code == 403
