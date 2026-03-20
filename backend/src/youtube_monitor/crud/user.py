from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from youtube_monitor.models.user import User
from youtube_monitor.auth.security import verify_password, get_password_hash
from typing import Optional


async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession, username: str, password: str, email: Optional[str] = None
) -> User:
    user = User(
        username=username,
        hashed_password=get_password_hash(password),
        email=email,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(
    db: AsyncSession, username: str, password: str
) -> Optional[User]:
    user = await get_user_by_username(db, username)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user
