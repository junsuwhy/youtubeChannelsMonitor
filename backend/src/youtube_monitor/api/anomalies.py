from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from youtube_monitor.database import get_session
from youtube_monitor.crud.anomaly import get_channel_anomalies
from youtube_monitor.schemas.anomaly import AnomalyListResponse

try:
    from youtube_monitor.auth.deps import get_current_user
except ImportError:

    async def get_current_user():
        pass


router = APIRouter(tags=["anomalies"])


@router.get("/channels/{channel_id}/anomalies", response_model=AnomalyListResponse)
async def get_anomalies(
    channel_id: int,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    event_type: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    items, total = await get_channel_anomalies(
        db, channel_id, event_type=event_type, page=page, limit=limit
    )
    return AnomalyListResponse(items=items, total=total, page=page, limit=limit)
