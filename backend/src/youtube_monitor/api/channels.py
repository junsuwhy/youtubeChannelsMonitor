from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from youtube_monitor.database import get_session
from youtube_monitor.models.user import User
from youtube_monitor.crud import channel as channel_crud
from youtube_monitor.schemas.channel import (
    ChannelCreate,
    ChannelUpdate,
    ChannelResponse,
    ChannelListResponse,
)

# Import get_current_user — this will be available once T5 completes
# For now we create a placeholder that will be overridden
try:
    from youtube_monitor.auth.deps import get_current_user
except ImportError:
    # T5 not yet complete — will be fixed when T5 runs
    async def get_current_user():
        pass


router = APIRouter(tags=["channels"])


@router.get("/channels", response_model=ChannelListResponse)
async def list_channels(
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    channels, total = await channel_crud.get_channels(
        db, status=status, page=page, limit=limit
    )
    return ChannelListResponse(items=channels, total=total, page=page, limit=limit)


@router.post(
    "/channels", response_model=ChannelResponse, status_code=status.HTTP_201_CREATED
)
async def create_channel(
    data: ChannelCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        channel = await channel_crud.create_channel(db, data)
        return channel
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Channel with youtube_channel_id '{data.youtube_channel_id}' already exists",
        )


@router.get("/channels/{channel_id}", response_model=ChannelResponse)
async def get_channel(
    channel_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    channel = await channel_crud.get_channel(db, channel_id)
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found"
        )
    return channel


@router.patch("/channels/{channel_id}", response_model=ChannelResponse)
async def update_channel(
    channel_id: int,
    data: ChannelUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    channel = await channel_crud.get_channel(db, channel_id)
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found"
        )
    return await channel_crud.update_channel(db, channel, data)


@router.delete("/channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_channel(
    channel_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    channel = await channel_crud.get_channel(db, channel_id)
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found"
        )
    await channel_crud.soft_delete_channel(db, channel)
