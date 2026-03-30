import re
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy import text
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
from youtube_monitor.collector.jobs.channel_snapshot import run_channel_snapshot_job
from youtube_monitor.collector.jobs.discover_videos import run_discover_videos_job
from youtube_monitor.collector.jobs.video_snapshot import run_video_snapshot_job
from youtube_monitor.collector.youtube_client import YouTubeClient
from youtube_monitor.config import settings
from youtube_monitor.api.system import _get_used_today, QUOTA_LIMIT
from googleapiclient.errors import HttpError as YouTubeHttpError

try:
    from youtube_monitor.auth.deps import get_current_user
except ImportError:

    async def get_current_user():
        pass


def _channel_response(channel, stats: dict) -> ChannelResponse:
    return ChannelResponse(
        **{
            **{c.key: getattr(channel, c.key) for c in channel.__table__.columns},
            **stats,
        }
    )


router = APIRouter(tags=["channels"])


async def _run_channel_fetch_background(channel_id: int) -> None:
    """Background task: run all three collector jobs for a single channel.

    Called automatically after channel creation. Fire-and-forget — errors are
    logged but do not affect the HTTP response.
    """
    import logging

    logger = logging.getLogger(__name__)
    try:
        from youtube_monitor.database import AsyncSessionLocal

        youtube_client = YouTubeClient(api_key=settings.youtube_api_key)
        async with AsyncSessionLocal() as session:
            await run_channel_snapshot_job(
                session, youtube_client, channel_id=channel_id
            )
        async with AsyncSessionLocal() as session:
            await run_discover_videos_job(
                session, youtube_client, channel_id=channel_id
            )
        async with AsyncSessionLocal() as session:
            await run_video_snapshot_job(session, youtube_client, channel_id=channel_id)
        logger.info("Background fetch completed for channel %d", channel_id)
    except Exception as e:
        logger.error("Background fetch failed for channel %d: %s", channel_id, e)


def _parse_channel_id_from_url(url: str) -> tuple[str | None, str | None]:
    """Extract channel_id or handle from a YouTube URL.

    Returns (channel_id, handle) where one is set and the other is None.
    Returns (None, None) if the input doesn't look like a YouTube URL — treat as raw ID.
    """
    url = url.strip()

    channel_id_match = re.search(r"youtube\.com/channel/(UC[\w-]{20,})", url)
    if channel_id_match:
        return channel_id_match.group(1), None

    handle_match = re.search(r"youtube\.com/@([\w.-]+)", url)
    if handle_match:
        return None, handle_match.group(1)

    custom_match = re.search(r"youtube\.com/c/([\w.-]+)", url)
    if custom_match:
        return None, custom_match.group(1)

    user_match = re.search(r"youtube\.com/user/([\w.-]+)", url)
    if user_match:
        return None, user_match.group(1)

    return None, None


@router.get("/channels/resolve")
async def resolve_channel_url(
    url: str = Query(..., description="YouTube channel URL or channel ID"),
    current_user: User = Depends(get_current_user),
):
    url = url.strip()
    channel_id, handle = _parse_channel_id_from_url(url)

    if channel_id is None and handle is None:
        if url.startswith("UC") and len(url) >= 22:
            return {
                "youtube_channel_id": url,
                "channel_name": None,
                "thumbnail_url": None,
            }
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="無法識別的頻道網址格式",
        )

    if channel_id:
        return {
            "youtube_channel_id": channel_id,
            "channel_name": None,
            "thumbnail_url": None,
        }

    youtube_client = YouTubeClient(api_key=settings.youtube_api_key)
    result = await youtube_client.resolve_channel_by_handle(handle)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"找不到頻道：{handle}",
        )
    return result


@router.get("/channels", response_model=ChannelListResponse)
async def list_channels(
    status: str | None = Query(default=None),
    source: str | None = Query(default=None),
    tags: str | None = Query(default=None),
    search: str | None = Query(default=None),
    sort_by: str | None = Query(
        default=None,
        pattern="^(subscriber_count|video_count|view_count|created_at|updated_at)$",
    ),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    tags_list = tags.split(",") if tags else None
    channels, total = await channel_crud.get_channels(
        db,
        status=status,
        source=source,
        tags=tags_list,
        search=search,
        sort_by=sort_by,
        page=page,
        limit=limit,
    )
    stats_map = await channel_crud.get_latest_snapshot_stats(
        db, [c.id for c in channels]
    )
    items = [_channel_response(c, stats_map.get(c.id, {})) for c in channels]
    return ChannelListResponse(items=items, total=total, page=page, limit=limit)


@router.get("/channels/tags")
async def get_channel_tags(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[str]:
    result = await db.execute(
        text(
            "SELECT DISTINCT json_each.value"
            " FROM channels, json_each(channels.tags)"
            " WHERE channels.tags IS NOT NULL AND channels.tags != '[]'"
            " ORDER BY json_each.value"
        )
    )
    return [row[0] for row in result.fetchall()]


@router.post(
    "/channels", response_model=ChannelResponse, status_code=status.HTTP_201_CREATED
)
async def create_channel(
    data: ChannelCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    try:
        channel = await channel_crud.create_channel(db, data)
        background_tasks.add_task(_run_channel_fetch_background, channel.id)
        stats_map = await channel_crud.get_latest_snapshot_stats(db, [channel.id])
        return _channel_response(channel, stats_map.get(channel.id, {}))
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
    stats_map = await channel_crud.get_latest_snapshot_stats(db, [channel_id])
    return _channel_response(channel, stats_map.get(channel_id, {}))


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
    channel = await channel_crud.update_channel(db, channel, data)
    stats_map = await channel_crud.get_latest_snapshot_stats(db, [channel_id])
    return _channel_response(channel, stats_map.get(channel_id, {}))


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


@router.post("/channels/{channel_id}/fetch")
async def fetch_channel_now(
    channel_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Immediately run all three collector jobs for a single channel.

    Returns 404 if the channel doesn't exist or is not active.
    Returns 429 if the YouTube API quota is fully exhausted (remaining == 0).
    """
    # 1. Check channel exists and is active
    channel = await channel_crud.get_channel(db, channel_id)
    if not channel or channel.status != "active":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Channel not found or not active",
        )

    # 2. Quota check — per-channel fetch uses remaining > 0 (not the 100-unit threshold)
    used_today = await _get_used_today(db)
    remaining = max(0, QUOTA_LIMIT - used_today)
    if remaining == 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Quota exhausted. Used today: {used_today}, limit: {QUOTA_LIMIT}",
        )

    # 3. Run all three jobs in sequence (ordering matters: snapshot → discover → video_snapshot)
    youtube_client = YouTubeClient(api_key=settings.youtube_api_key)
    results = {}

    from youtube_monitor.database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as session:
            results["channel_snapshot"] = await run_channel_snapshot_job(
                session, youtube_client, channel_id=channel_id
            )
        async with AsyncSessionLocal() as session:
            results["discover_videos"] = await run_discover_videos_job(
                session, youtube_client, channel_id=channel_id
            )
        async with AsyncSessionLocal() as session:
            results["video_snapshot"] = await run_video_snapshot_job(
                session, youtube_client, channel_id=channel_id
            )
    except YouTubeHttpError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"YouTube API error: {e.reason}",
        )

    # 4. Re-fetch channel to get updated status
    refreshed = await channel_crud.get_channel(db, channel_id)
    channel_status = refreshed.status if refreshed else "unknown"

    return {
        "status": "ok",
        "channel_id": channel_id,
        "channel_status": channel_status,
        "results": results,
    }
