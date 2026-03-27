from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, timedelta, timezone, date
from typing import Optional, List, Any, Dict
from youtube_monitor.models.video import Video
from youtube_monitor.models.video_snapshot import VideoSnapshot
from youtube_monitor.models.channel_snapshot import ChannelSnapshot
from youtube_monitor.models.channel import Channel


def _derive_thumbnail_url(youtube_video_id: str) -> str:
    return f"https://i.ytimg.com/vi/{youtube_video_id}/mqdefault.jpg"


async def get_videos(
    db: AsyncSession,
    channel_id: Optional[int] = None,
    page: int = 1,
    limit: int = 50,
    title: Optional[str] = None,
    status: Optional[str] = None,
    include_non_public: bool = False,
    published_after: Optional[date] = None,
    published_before: Optional[date] = None,
    sort_by: Optional[str] = None,
) -> tuple[List[Dict[str, Any]], int]:
    count_query = select(func.count()).select_from(Video)

    if not include_non_public:
        count_query = count_query.where(Video.status == "public")
    elif status:
        count_query = count_query.where(Video.status == status)

    if channel_id:
        count_query = count_query.where(Video.channel_id == channel_id)
    if title:
        count_query = count_query.where(Video.title.ilike(f"%{title}%"))
    if published_after:
        count_query = count_query.where(Video.published_at >= published_after)
    if published_before:
        count_query = count_query.where(Video.published_at <= published_before)

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    latest_snap_date_sq = (
        select(
            VideoSnapshot.video_id,
            func.max(VideoSnapshot.snapshot_date).label("max_date"),
        )
        .group_by(VideoSnapshot.video_id)
        .subquery()
    )

    sort_map = {
        "view_count": desc(VideoSnapshot.view_count),
        "like_count": desc(VideoSnapshot.like_count),
        "comment_count": desc(VideoSnapshot.comment_count),
        "created_at": desc(Video.created_at),
        "published_at": desc(Video.published_at),
    }

    offset = (page - 1) * limit
    query = (
        select(
            Video,
            Channel.channel_name,
            VideoSnapshot.view_count,
            VideoSnapshot.like_count,
            VideoSnapshot.comment_count,
        )
        .join(Channel, Video.channel_id == Channel.id)
        .outerjoin(
            latest_snap_date_sq,
            Video.id == latest_snap_date_sq.c.video_id,
        )
        .outerjoin(
            VideoSnapshot,
            (VideoSnapshot.video_id == Video.id)
            & (VideoSnapshot.snapshot_date == latest_snap_date_sq.c.max_date),
        )
    )

    if not include_non_public:
        query = query.where(Video.status == "public")
    elif status:
        query = query.where(Video.status == status)

    if channel_id:
        query = query.where(Video.channel_id == channel_id)
    if title:
        query = query.where(Video.title.ilike(f"%{title}%"))
    if published_after:
        query = query.where(Video.published_at >= published_after)
    if published_before:
        query = query.where(Video.published_at <= published_before)

    if sort_by and sort_by in sort_map:
        query = query.order_by(sort_map[sort_by])
    else:
        query = query.order_by(desc(Video.published_at))

    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    rows = result.all()

    enriched = []
    for row in rows:
        video = row[0]
        channel_name = row[1]
        view_count = row[2]
        like_count = row[3]
        comment_count = row[4]
        item: Dict[str, Any] = {
            "id": video.id,
            "youtube_video_id": video.youtube_video_id,
            "channel_id": video.channel_id,
            "channel_name": channel_name,
            "title": video.title,
            "description": video.description,
            "published_at": video.published_at,
            "duration": video.duration,
            "tags": video.tags,
            "topic_categories": video.topic_categories,
            "status": video.status,
            "created_at": video.created_at,
            "thumbnail_url": _derive_thumbnail_url(video.youtube_video_id),
            "view_count": view_count,
            "like_count": like_count,
            "comment_count": comment_count,
        }
        enriched.append(item)

    return enriched, total


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


async def get_new_videos(db: AsyncSession, limit: int = 20) -> List[Dict[str, Any]]:
    latest_snap_date_sq = (
        select(
            VideoSnapshot.video_id,
            func.max(VideoSnapshot.snapshot_date).label("max_date"),
        )
        .group_by(VideoSnapshot.video_id)
        .subquery()
    )

    result = await db.execute(
        select(
            Video,
            Channel.channel_name,
            VideoSnapshot.view_count,
            VideoSnapshot.like_count,
            VideoSnapshot.comment_count,
        )
        .join(Channel, Video.channel_id == Channel.id)
        .outerjoin(latest_snap_date_sq, Video.id == latest_snap_date_sq.c.video_id)
        .outerjoin(
            VideoSnapshot,
            (VideoSnapshot.video_id == Video.id)
            & (VideoSnapshot.snapshot_date == latest_snap_date_sq.c.max_date),
        )
        .where(Video.status == "public")
        .order_by(desc(Video.created_at))
        .limit(limit)
    )

    enriched = []
    for row in result.all():
        video, channel_name, view_count, like_count, comment_count = row
        enriched.append(
            {
                "id": video.id,
                "youtube_video_id": video.youtube_video_id,
                "channel_id": video.channel_id,
                "channel_name": channel_name,
                "title": video.title,
                "published_at": video.published_at,
                "created_at": video.created_at,
                "thumbnail_url": _derive_thumbnail_url(video.youtube_video_id),
                "view_count": view_count,
                "like_count": like_count,
                "comment_count": comment_count,
            }
        )
    return enriched
