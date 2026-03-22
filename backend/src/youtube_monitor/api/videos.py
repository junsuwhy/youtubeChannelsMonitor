from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from datetime import date

from youtube_monitor.database import get_session
from youtube_monitor.models.user import User
from youtube_monitor.crud import video as video_crud
from youtube_monitor.schemas.video import (
    VideoResponse,
    VideoListResponse,
    VideoSnapshotResponse,
    ChannelSnapshotResponse,
)

try:
    from youtube_monitor.auth.deps import get_current_user
except ImportError:

    async def get_current_user():
        pass


router = APIRouter(tags=["videos"])

_SORT_PATTERN = "^(published_at|view_count|like_count|comment_count|created_at)$"


@router.get("/videos", response_model=VideoListResponse)
async def list_videos(
    channel_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    title: str | None = Query(default=None),
    status: str | None = Query(default=None),
    include_non_public: bool = Query(default=False),
    published_after: date | None = Query(default=None),
    published_before: date | None = Query(default=None),
    sort_by: str | None = Query(default=None, pattern=_SORT_PATTERN),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    videos, total = await video_crud.get_videos(
        db,
        channel_id=channel_id,
        page=page,
        limit=limit,
        title=title,
        status=status,
        include_non_public=include_non_public,
        published_after=published_after,
        published_before=published_before,
        sort_by=sort_by,
    )
    items = [VideoResponse.model_validate(v) for v in videos]
    return VideoListResponse(items=items, total=total, page=page, limit=limit)


@router.get("/videos/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    video = await video_crud.get_video(db, video_id)
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Video not found"
        )
    return video


@router.get("/videos/{video_id}/snapshots", response_model=List[VideoSnapshotResponse])
async def get_video_snapshots(
    video_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    video = await video_crud.get_video(db, video_id)
    if not video:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Video not found"
        )
    return await video_crud.get_video_snapshots(db, video_id)


@router.get("/channels/{channel_id}/videos", response_model=VideoListResponse)
async def list_channel_videos(
    channel_id: int,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    title: str | None = Query(default=None),
    status: str | None = Query(default=None),
    include_non_public: bool = Query(default=False),
    published_after: date | None = Query(default=None),
    published_before: date | None = Query(default=None),
    sort_by: str | None = Query(default=None, pattern=_SORT_PATTERN),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    videos, total = await video_crud.get_videos(
        db,
        channel_id=channel_id,
        page=page,
        limit=limit,
        title=title,
        status=status,
        include_non_public=include_non_public,
        published_after=published_after,
        published_before=published_before,
        sort_by=sort_by,
    )
    items = [VideoResponse.model_validate(v) for v in videos]
    return VideoListResponse(items=items, total=total, page=page, limit=limit)


@router.get(
    "/channels/{channel_id}/snapshots", response_model=List[ChannelSnapshotResponse]
)
async def get_channel_snapshots(
    channel_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return await video_crud.get_channel_snapshots(db, channel_id)
