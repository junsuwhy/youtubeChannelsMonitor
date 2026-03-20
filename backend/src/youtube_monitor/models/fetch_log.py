import datetime
from sqlalchemy import String, Text, Integer, DateTime
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy import func
from typing import Optional
from youtube_monitor.models.base import Base


class FetchLog(Base):
    __tablename__ = "fetch_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_name: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    channels_processed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    videos_processed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    api_units_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    finished_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime, nullable=True
    )
