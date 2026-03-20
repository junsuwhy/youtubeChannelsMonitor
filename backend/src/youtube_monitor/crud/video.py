from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from youtube_monitor.models.video import Video
from youtube_monitor.models.video_snapshot import VideoSnapshot
from youtube_monitor.models.channel_snapshot import ChannelSnapshot
from youtube_monitor.models.channel import Channel


async def get_videos(
    db: AsyncSession,
    channel_id: Optional[int] = None,
    page: int = 1,
    limit: int = 50,
) -> tuple[List[Video], int]:
    query = select(Video).where(Video.status == "public")
    count_query = (
        select(func.count()).select_from(Video).where(Video.status == "public")
    )

    if channel_id:
        query = query.where(Video.channel_id == channel_id)
        count_query = count_query.where(Video.channel_id == channel_id)

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    offset = (page - 1) * limit
    result = await db.execute(query.offset(offset).limit(limit))
    return list(result.scalars().all()), total


async def get_video(db: AsyncSession, video_id: int) -> Optional[Video]:
    result = await db.execute(select(Video).where(Video.id == video_id))
    return result.scalar_one_or_none()


async def get_video_snapshots(db: AsyncSession, video_id: int) -> List[VideoSnapshot]:
    result = await db.execute(
        select(VideoSnapshot)
        .where(VideoSnapshot.video_id == video_id)
        .order_by(VideoSnapshot.snapshot_date.asc())
    )
    return list(result.scalars().all())


async def get_channel_snapshots(
    db: AsyncSession, channel_id: int
) -> List[ChannelSnapshot]:
    result = await db.execute(
        select(ChannelSnapshot)
        .where(ChannelSnapshot.channel_id == channel_id)
        .order_by(ChannelSnapshot.snapshot_date.asc())
    )
    return list(result.scalars().all())


async def get_stats_overview(db: AsyncSession) -> dict:
    total_channels = await db.scalar(select(func.count()).select_from(Channel))
    active_channels = await db.scalar(
        select(func.count()).select_from(Channel).where(Channel.status == "active")
    )
    total_videos = await db.scalar(select(func.count()).select_from(Video))

    # Videos created in the last 7 days
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    new_videos = await db.scalar(
        select(func.count()).select_from(Video).where(Video.created_at >= week_ago)
    )

    return {
        "total_channels": total_channels or 0,
        "total_videos": total_videos or 0,
        "active_channels": active_channels or 0,
        "new_videos_this_week": new_videos or 0,
    }


async def get_top_videos(
    db: AsyncSession, sort_by: str = "view_count", limit: int = 10
) -> List[Video]:
    # Get latest snapshot date
    latest_date = await db.scalar(select(func.max(VideoSnapshot.snapshot_date)))
    if not latest_date:
        return []

    # Join Video with latest snapshot
    result = await db.execute(
        select(Video, VideoSnapshot)
        .join(VideoSnapshot, Video.id == VideoSnapshot.video_id)
        .where(VideoSnapshot.snapshot_date == latest_date)
        .order_by(desc(VideoSnapshot.view_count))
        .limit(limit)
    )
    rows = result.all()
    return [row[0] for row in rows]


async def get_new_videos(db: AsyncSession, limit: int = 20) -> List[Video]:
    result = await db.execute(
        select(Video)
        .where(Video.status == "public")
        .order_by(desc(Video.created_at))
        .limit(limit)
    )
    return list(result.scalars().all())
