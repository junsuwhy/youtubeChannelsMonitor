import datetime
from sqlalchemy import Integer, Date, BigInteger, UniqueConstraint, ForeignKey
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from youtube_monitor.models.base import Base


class ChannelSnapshot(Base):
    __tablename__ = "channel_snapshots"

    __table_args__ = (UniqueConstraint("channel_id", "snapshot_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    channel_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("channels.id"), index=True, nullable=False
    )
    snapshot_date: Mapped[Optional[datetime.date]] = mapped_column(Date, nullable=False)
    subscriber_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    view_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    video_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
