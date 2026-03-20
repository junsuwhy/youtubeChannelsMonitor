import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy import func
from typing import Optional
from youtube_monitor.models.base import Base


class CofactsSource(Base):
    __tablename__ = "cofacts_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    channel_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("channels.id"), nullable=True
    )
    cofacts_article_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
