from sqlalchemy import String, Text, JSON, DateTime, Integer
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy import func
from typing import Optional, Any
from youtube_monitor.models.base import Base


class Channel(Base):
    __tablename__ = "channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    youtube_channel_id: Mapped[str] = mapped_column(
        String(24), unique=True, index=True, nullable=False
    )
    channel_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    topic_categories: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    custom_url: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    uploads_playlist_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    source: Mapped[str] = mapped_column(String(50), default="manual", nullable=False)
    schedule_hour: Mapped[int] = mapped_column(Integer, default=6, nullable=False, server_default="6")
    created_at: Mapped[Optional[Any]] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    updated_at: Mapped[Optional[Any]] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
