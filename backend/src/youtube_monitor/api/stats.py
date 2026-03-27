from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from youtube_monitor.database import get_session
from youtube_monitor.crud import video as video_crud
from youtube_monitor.schemas.video import (
    StatsOverviewResponse,
    ChannelTrendPoint,
)

try:
    from youtube_monitor.auth.deps import get_current_user
except ImportError:

    async def get_current_user():
        pass


router = APIRouter(tags=["stats"])


@router.get("/stats/overview", response_model=StatsOverviewResponse)
async def stats_overview(
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    data = await video_crud.get_stats_overview(db)
    return StatsOverviewResponse(**data)


@router.get(
    "/stats/channels/{channel_id}/trend", response_model=List[ChannelTrendPoint]
)
async def channel_trend(
    channel_id: int,
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    snapshots = await video_crud.get_channel_snapshots(db, channel_id)
    return [
        ChannelTrendPoint(
            date=s.snapshot_date,
            subscriber_count=s.subscriber_count,
            view_count=s.view_count,
        )
        for s in snapshots
    ]


@router.get("/stats/videos/top")
async def top_videos(
    sort_by: str = Query(default="view_count"),
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    videos = await video_crud.get_top_videos(db, sort_by=sort_by, limit=limit)
    return {
        "items": [
            {"id": v.id, "youtube_video_id": v.youtube_video_id, "title": v.title}
            for v in videos
        ]
    }


@router.get("/stats/videos/new")
async def new_videos(
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    videos = await video_crud.get_new_videos(db, limit=limit)
    return {
        "items": [
            {
                "id": v["id"],
                "youtube_video_id": v["youtube_video_id"],
                "channel_id": v["channel_id"],
                "channel_name": v["channel_name"],
                "title": v["title"],
                "published_at": str(v["published_at"]) if v["published_at"] else None,
                "created_at": str(v["created_at"]),
                "thumbnail_url": v["thumbnail_url"],
                "view_count": v["view_count"],
                "like_count": v["like_count"],
                "comment_count": v["comment_count"],
            }
            for v in videos
        ]
    }
