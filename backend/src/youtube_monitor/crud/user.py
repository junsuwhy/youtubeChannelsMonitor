from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, Any
from youtube_monitor.models.user import User, UserRole
from youtube_monitor.auth.security import verify_password, get_password_hash


async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_all_users(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).order_by(User.id))
    return list(result.scalars().all())


async def create_user(
    db: AsyncSession,
    username: str,
    password: str,
    email: Optional[str] = None,
    role: UserRole = UserRole.viewer,
) -> User:
    user = User(
        username=username,
        hashed_password=get_password_hash(password),
        email=email,
        is_active=True,
        role=role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(
    db: AsyncSession,
    user_id: int,
    **kwargs: Any,
) -> Optional[User]:
    user = await get_user_by_id(db, user_id)
    if not user:
        return None
    for key, value in kwargs.items():
        if key == "password":
            setattr(user, "hashed_password", get_password_hash(value))
        else:
            setattr(user, key, value)
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
