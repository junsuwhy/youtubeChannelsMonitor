import logging
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import text

from youtube_monitor.collector.jobs.channel_snapshot import run_channel_snapshot_job
from youtube_monitor.collector.jobs.discover_videos import run_discover_videos_job
from youtube_monitor.collector.jobs.video_snapshot import run_video_snapshot_job

logger = logging.getLogger(__name__)
TAIPEI_TZ = ZoneInfo("Asia/Taipei")


async def run_wal_checkpoint(session_factory):
    """Run SQLite WAL checkpoint to prevent unbounded WAL file growth."""
    async with session_factory() as session:
        await session.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
        await session.commit()


async def _channel_snapshot_wrapper(session_factory, youtube_client):
    """Wrapper that opens a session and runs the channel snapshot job."""
    async with session_factory() as session:
        await run_channel_snapshot_job(session, youtube_client)


async def _discover_videos_wrapper(session_factory, youtube_client):
    """Wrapper that opens a session and runs the discover videos job."""
    async with session_factory() as session:
        await run_discover_videos_job(session, youtube_client)


async def _video_snapshot_wrapper(session_factory, youtube_client):
    """Wrapper that opens a session and runs the video snapshot job."""
    async with session_factory() as session:
        await run_video_snapshot_job(session, youtube_client)


def create_scheduler(session_factory, youtube_client) -> AsyncIOScheduler:
    """Create and configure the APScheduler AsyncIOScheduler."""
    scheduler = AsyncIOScheduler(timezone=TAIPEI_TZ)

    # Channel snapshot: daily at 04:00 Taipei
    scheduler.add_job(
        _channel_snapshot_wrapper,
        CronTrigger(hour=4, minute=0, timezone=TAIPEI_TZ),
        id="channel_snapshot",
        max_instances=1,  # MANDATORY: prevents SQLite lock contention
        misfire_grace_time=3600,
        kwargs={"session_factory": session_factory, "youtube_client": youtube_client},
    )
    # Video discovery: daily at 06:00 Taipei
    scheduler.add_job(
        _discover_videos_wrapper,
        CronTrigger(hour=6, minute=0, timezone=TAIPEI_TZ),
        id="discover_videos",
        max_instances=1,
        misfire_grace_time=3600,
        kwargs={"session_factory": session_factory, "youtube_client": youtube_client},
    )
    # Video snapshot: daily at 08:00 Taipei
    scheduler.add_job(
        _video_snapshot_wrapper,
        CronTrigger(hour=8, minute=0, timezone=TAIPEI_TZ),
        id="video_snapshot",
        max_instances=1,
        misfire_grace_time=3600,
        kwargs={"session_factory": session_factory, "youtube_client": youtube_client},
    )
    # WAL checkpoint: every hour
    scheduler.add_job(
        run_wal_checkpoint,
        CronTrigger(minute=0),
        id="wal_checkpoint",
        max_instances=1,
        misfire_grace_time=300,
        kwargs={"session_factory": session_factory},
    )

    return scheduler
