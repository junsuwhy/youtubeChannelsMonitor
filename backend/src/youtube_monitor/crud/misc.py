from sqlalchemy.ext.asyncio import AsyncSession
from youtube_monitor.schemas.misc import DailyStatResponse, DailyStatPoint


async def get_daily_quota_usage(db: AsyncSession, days: int = 30) -> DailyStatResponse:
    """Get daily quota usage stats."""
    # TODO: Implement actual quota usage retrieval from FetchLog
    return DailyStatResponse(items=[])


async def get_daily_channel_additions(
    db: AsyncSession, days: int = 30
) -> DailyStatResponse:
    """Get daily channel additions stats."""
    # TODO: Implement actual channel additions retrieval
    return DailyStatResponse(items=[])


async def get_daily_new_videos(db: AsyncSession, days: int = 30) -> DailyStatResponse:
    """Get daily new videos stats."""
    # TODO: Implement actual new videos retrieval
    return DailyStatResponse(items=[])
