import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import text

from youtube_monitor.collector.jobs.channel_snapshot import run_channel_snapshot_job
from youtube_monitor.collector.jobs.discover_videos import run_discover_videos_job
from youtube_monitor.collector.jobs.video_snapshot import run_video_snapshot_job

logger = logging.getLogger(__name__)
TAIPEI_TZ = ZoneInfo("Asia/Taipei")

# Populated by create_scheduler() so trigger_all_jobs() can reach them.
_trigger_state: dict = {}


async def run_wal_checkpoint(session_factory):
    """Run SQLite WAL checkpoint to prevent unbounded WAL file growth."""
    async with session_factory() as session:
        await session.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
        await session.commit()


async def _channel_snapshot_wrapper(session_factory, youtube_client):
    """Wrapper that opens a session and runs the channel snapshot job."""
    current_hour = datetime.now(TAIPEI_TZ).hour
    async with session_factory() as session:
        await run_channel_snapshot_job(session, youtube_client, current_hour=current_hour)


async def _discover_videos_wrapper(session_factory, youtube_client):
    """Wrapper that opens a session and runs the discover videos job."""
    current_hour = datetime.now(TAIPEI_TZ).hour
    async with session_factory() as session:
        await run_discover_videos_job(session, youtube_client, current_hour=current_hour)


async def _video_snapshot_wrapper(session_factory, youtube_client):
    """Wrapper that opens a session and runs the video snapshot job."""
    current_hour = datetime.now(TAIPEI_TZ).hour
    async with session_factory() as session:
        await run_video_snapshot_job(session, youtube_client, current_hour=current_hour)


async def trigger_all_jobs():
    """Immediately run all collector jobs sequentially (channel → discover → video).
    Called by the /system/fetch/trigger API endpoint after quota check."""
    session_factory = _trigger_state.get("session_factory")
    youtube_client = _trigger_state.get("youtube_client")
    if session_factory is None or youtube_client is None:
        logger.warning("trigger_all_jobs called before scheduler was initialised — skipping")
        return
    await _channel_snapshot_wrapper(session_factory, youtube_client)
    await _discover_videos_wrapper(session_factory, youtube_client)
    await _video_snapshot_wrapper(session_factory, youtube_client)


def create_scheduler(session_factory, youtube_client) -> AsyncIOScheduler:
    """Create and configure the APScheduler AsyncIOScheduler."""
    _trigger_state["session_factory"] = session_factory
    _trigger_state["youtube_client"] = youtube_client
    scheduler = AsyncIOScheduler(timezone=TAIPEI_TZ)

    # Channel snapshot: every hour at :50 Taipei
    scheduler.add_job(
        _channel_snapshot_wrapper,
        CronTrigger(minute=50, timezone=TAIPEI_TZ),
        id="channel_snapshot",
        max_instances=1,
        misfire_grace_time=3600,
        kwargs={"session_factory": session_factory, "youtube_client": youtube_client},
    )
    # Video discovery: every hour at :10 Taipei
    scheduler.add_job(
        _discover_videos_wrapper,
        CronTrigger(minute=10, timezone=TAIPEI_TZ),
        id="discover_videos",
        max_instances=1,
        misfire_grace_time=3600,
        kwargs={"session_factory": session_factory, "youtube_client": youtube_client},
    )
    # Video snapshot: every hour at :30 Taipei
    scheduler.add_job(
        _video_snapshot_wrapper,
        CronTrigger(minute=30, timezone=TAIPEI_TZ),
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
