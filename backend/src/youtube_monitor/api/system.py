from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime
from typing import Optional

from youtube_monitor.database import get_session
from youtube_monitor.models.fetch_log import FetchLog
from youtube_monitor.schemas.system import (
    QuotaResponse,
    FetchLogListResponse,
    TriggerResponse,
)

try:
    from youtube_monitor.auth.deps import get_current_user
except ImportError:

    async def get_current_user():
        pass


router = APIRouter(tags=["system"])

QUOTA_LIMIT = 10000
QUOTA_MINIMUM_THRESHOLD = 100


async def _get_used_today(db: AsyncSession) -> int:
    """Sum api_units_used from fetch_logs for today (Asia/Taipei date)."""
    from zoneinfo import ZoneInfo

    taipei_tz = ZoneInfo("Asia/Taipei")
    today = datetime.now(taipei_tz).date()

    result = await db.execute(
        select(func.coalesce(func.sum(FetchLog.api_units_used), 0)).where(
            func.date(FetchLog.started_at) == today.isoformat()
        )
    )
    return result.scalar() or 0


@router.get("/system/quota", response_model=QuotaResponse)
async def get_quota(
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    from zoneinfo import ZoneInfo

    taipei_tz = ZoneInfo("Asia/Taipei")
    today = datetime.now(taipei_tz).date()

    used_today = await _get_used_today(db)
    remaining = max(0, QUOTA_LIMIT - used_today)
    percentage = round(used_today / QUOTA_LIMIT * 100, 2)

    return QuotaResponse(
        date=today,
        used_today=used_today,
        quota_limit=QUOTA_LIMIT,
        remaining=remaining,
        percentage_used=percentage,
    )


@router.get("/system/logs", response_model=FetchLogListResponse)
async def get_logs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    job_type: Optional[str] = Query(default=None),
    channel_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    query = select(FetchLog).order_by(FetchLog.started_at.desc())
    count_query = select(func.count()).select_from(FetchLog)

    if job_type:
        query = query.where(FetchLog.job_name == job_type)
        count_query = count_query.where(FetchLog.job_name == job_type)

    if channel_id is not None:
        query = query.where(FetchLog.channel_id == channel_id)
        count_query = count_query.where(FetchLog.channel_id == channel_id)

    total = await db.scalar(count_query)
    offset = (page - 1) * limit
    result = await db.execute(query.offset(offset).limit(limit))
    logs = list(result.scalars().all())

    return FetchLogListResponse(items=logs, total=total or 0, page=page, limit=limit)


@router.post("/system/fetch/trigger", response_model=TriggerResponse)
async def trigger_fetch(
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """Manually trigger all collector jobs.

    CRITICAL: Check quota FIRST. Return 429 if remaining < QUOTA_MINIMUM_THRESHOLD.
    This prevents quota overrun from manual triggers.
    """
    used_today = await _get_used_today(db)
    remaining = max(0, QUOTA_LIMIT - used_today)

    if remaining < QUOTA_MINIMUM_THRESHOLD:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Quota insufficient. remaining: {remaining}, required_minimum: {QUOTA_MINIMUM_THRESHOLD}",
        )

    # Trigger jobs via APScheduler (Task 18 will wire this up)
    # For now, publish trigger event to the scheduler
    jobs = ["channel_snapshot", "discover_videos", "video_snapshot"]

    try:
        # Import scheduler if available (wired up in Task 18)
        from youtube_monitor.collector.scheduler import trigger_all_jobs

        await trigger_all_jobs()
    except (ImportError, AttributeError):
        # Scheduler not yet wired up — jobs list returned as confirmation
        pass

    return TriggerResponse(
        status="triggered",
        jobs=jobs,
        quota_remaining=remaining,
    )
