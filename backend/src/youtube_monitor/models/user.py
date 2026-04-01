import datetime
import enum
from sqlalchemy import String, Boolean, Integer, DateTime, Enum
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy import func
from typing import Optional
from youtube_monitor.models.base import Base


class UserRole(str, enum.Enum):
    viewer = "viewer"
    content_admin = "content_admin"
    user_admin = "user_admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(
        String(50), unique=True, index=True, nullable=False
    )
    email: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, nullable=True
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), default=UserRole.viewer, nullable=False, server_default=UserRole.viewer.value
    )
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
