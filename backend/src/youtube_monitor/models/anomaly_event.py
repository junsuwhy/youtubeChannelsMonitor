import datetime
from sqlalchemy import String, Text, Float, ForeignKey, Date, Integer
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy import func
from typing import Optional
from youtube_monitor.models.base import Base


class AnomalyEvent(Base):
    __tablename__ = "anomaly_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("channels.id"), index=True)
    video_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("videos.id"), nullable=True, index=True
    )
    event_type: Mapped[str] = mapped_column(String(50))
    severity: Mapped[str] = mapped_column(String(20))
    summary: Mapped[str] = mapped_column(Text)
    metric_name: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    metric_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    baseline_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    deviation_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_acknowledged: Mapped[bool] = mapped_column(default=False)
    detected_at: Mapped[datetime.datetime] = mapped_column(server_default=func.now())
    snapshot_date: Mapped[datetime.date] = mapped_column(Date)
