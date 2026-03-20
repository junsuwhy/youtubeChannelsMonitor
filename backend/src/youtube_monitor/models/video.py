import datetime
from sqlalchemy import String, Text, JSON, DateTime, Integer, ForeignKey, Date
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy import func
from typing import Optional, Any
from youtube_monitor.models.base import Base


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    youtube_video_id: Mapped[str] = mapped_column(
        String(11), unique=True, index=True, nullable=False
    )
    channel_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("channels.id"), index=True, nullable=False
    )
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    published_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime, nullable=True
    )
    duration: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    tags: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    topic_categories: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    rapid_tracking_until: Mapped[Optional[datetime.date]] = mapped_column(
        Date, nullable=True
    )
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
