from datetime import datetime, timedelta, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from youtube_monitor.schemas.misc import DailyStatResponse, DailyStatPoint
from youtube_monitor.models.fetch_log import FetchLog
from youtube_monitor.models.channel import Channel
from youtube_monitor.models.video import Video


def _gap_fill(db_rows: list[tuple[str, int]], days: int) -> list[DailyStatPoint]:
    """Generate a complete date range for the last `days` days, filling missing with value=0."""
    today = datetime.now(timezone.utc).date()
    date_map = {row[0]: row[1] for row in db_rows}
    result = []
    for i in range(days - 1, -1, -1):  # days-1 down to 0 = oldest to newest
        d = (today - timedelta(days=i)).isoformat()
        result.append(DailyStatPoint(date=d, value=date_map.get(d, 0)))
    return result


async def get_daily_quota_usage(db: AsyncSession, days: int = 30) -> DailyStatResponse:
    """Get daily quota usage stats from FetchLog.started_at for the last `days` days."""
    threshold = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(
            func.date(FetchLog.started_at).label("date"),
            func.coalesce(func.sum(FetchLog.api_units_used), 0).label("value"),
        )
        .where(FetchLog.started_at >= threshold)
        .group_by(func.date(FetchLog.started_at))
    )
    rows = result.all()
    return DailyStatResponse(items=_gap_fill([(r.date, r.value) for r in rows], days))


async def get_daily_channel_additions(
    db: AsyncSession, days: int = 30
) -> DailyStatResponse:
    """Get daily count of manually-added channels (source='manual') for the last `days` days."""
    threshold = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(
            func.date(Channel.created_at).label("date"),
            func.count().label("value"),
        )
        .where(Channel.created_at >= threshold)
        .where(Channel.source == "manual")
        .group_by(func.date(Channel.created_at))
    )
    rows = result.all()
    return DailyStatResponse(items=_gap_fill([(r.date, r.value) for r in rows], days))


async def get_daily_new_videos(db: AsyncSession, days: int = 30) -> DailyStatResponse:
    threshold = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(
            func.date(Video.published_at).label("date"),
            func.count().label("value"),
        )
        .where(Video.published_at >= threshold)
        .where(Video.published_at.is_not(None))
        .group_by(func.date(Video.published_at))
    )
    rows = result.all()
    return DailyStatResponse(items=_gap_fill([(r.date, r.value) for r in rows], days))
