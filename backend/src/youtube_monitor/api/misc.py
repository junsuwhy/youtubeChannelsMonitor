from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from youtube_monitor.database import get_session
from youtube_monitor.crud import misc as misc_crud
from youtube_monitor.schemas.misc import DailyStatResponse

try:
    from youtube_monitor.auth.deps import get_current_user
except ImportError:

    async def get_current_user():
        pass


router = APIRouter(tags=["misc"])


@router.get("/misc/quota/daily", response_model=DailyStatResponse)
async def get_daily_quota_usage(
    days: int = Query(default=30, ge=1, le=90),
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    return await misc_crud.get_daily_quota_usage(db, days=days)


@router.get("/misc/channels/daily-additions", response_model=DailyStatResponse)
async def get_daily_channel_additions(
    days: int = Query(default=30, ge=1, le=90),
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    return await misc_crud.get_daily_channel_additions(db, days=days)


@router.get("/misc/videos/daily-new", response_model=DailyStatResponse)
async def get_daily_new_videos(
    days: int = Query(default=30, ge=1, le=90),
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    return await misc_crud.get_daily_new_videos(db, days=days)
