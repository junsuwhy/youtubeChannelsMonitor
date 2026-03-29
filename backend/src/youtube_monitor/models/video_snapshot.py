import datetime
from sqlalchemy import Integer, Date, DateTime, BigInteger, UniqueConstraint, ForeignKey
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from youtube_monitor.models.base import Base


class VideoSnapshot(Base):
    __tablename__ = "video_snapshots"

    __table_args__ = (UniqueConstraint("video_id", "snapshot_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    video_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("videos.id"), index=True, nullable=False
    )
    snapshot_date: Mapped[Optional[datetime.date]] = mapped_column(Date, nullable=False)
    crawled_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)
    view_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    like_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    comment_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
