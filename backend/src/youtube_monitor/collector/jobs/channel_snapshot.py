import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from youtube_monitor.models.channel import Channel
from youtube_monitor.models.channel_snapshot import ChannelSnapshot
from youtube_monitor.models.fetch_log import FetchLog
from youtube_monitor.collector.youtube_client import (
    YouTubeClient,
    QuotaExceededException,
)
from youtube_monitor.collector.utils import get_taipei_date

logger = logging.getLogger(__name__)


async def run_channel_snapshot_job(
    session: AsyncSession, youtube_client: YouTubeClient
) -> dict:
    """
    Daily channel statistics snapshot job (runs at 04:00 Taipei time).

    Flow:
    1. Query all channels with status='active'
    2. For each channel, call get_channel_info sequentially (1 unit per call)
    3. Update Channel fields (channel_name, updated_at)
    4. Upsert ChannelSnapshot for today (UTC+8 date), idempotent via ON CONFLICT DO UPDATE
    5. Channels not returned by API → set status='terminated'
    6. On QuotaExceededException → stop immediately, write fetch_log status='failed'
    7. Write fetch_log at the end

    Returns: dict with job stats
    """
    started_at = datetime.now(timezone.utc)
    today = get_taipei_date()
    channels_processed = 0
    api_units_used = 0

    # Fetch all active channels
    result = await session.execute(select(Channel).where(Channel.status == "active"))
    active_channels = result.scalars().all()

    if not active_channels:
        fetch_log = FetchLog(
            job_name="channel_snapshot",
            status="success",
            channels_processed=0,
            videos_processed=0,
            api_units_used=0,
            error_message=None,
            started_at=started_at,
            finished_at=datetime.now(timezone.utc),
        )
        session.add(fetch_log)
        await session.commit()
        return {"status": "success", "channels_processed": 0, "api_units_used": 0}

    try:
        for channel in active_channels:
            data = await youtube_client.get_channel_info(channel.youtube_channel_id)
            api_units_used += 1

            if data is None:
                # Channel not found on YouTube → mark as terminated
                await session.execute(
                    update(Channel)
                    .where(Channel.id == channel.id)
                    .values(status="terminated")
                )
                channels_processed += 1
                continue

            # Update channel fields
            await session.execute(
                update(Channel)
                .where(Channel.id == channel.id)
                .values(
                    channel_name=data["channel_name"],
                    updated_at=datetime.now(timezone.utc),
                )
            )

            # Upsert ChannelSnapshot (idempotent)
            stmt = sqlite_insert(ChannelSnapshot).values(
                channel_id=channel.id,
                snapshot_date=today,
                subscriber_count=data["subscriber_count"],
                view_count=data["view_count"],
                video_count=data["video_count"],
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["channel_id", "snapshot_date"],
                set_={
                    "subscriber_count": stmt.excluded.subscriber_count,
                    "view_count": stmt.excluded.view_count,
                    "video_count": stmt.excluded.video_count,
                },
            )
            await session.execute(stmt)
            channels_processed += 1

        # All channels processed successfully
        fetch_log = FetchLog(
            job_name="channel_snapshot",
            status="success",
            channels_processed=channels_processed,
            videos_processed=0,
            api_units_used=api_units_used,
            error_message=None,
            started_at=started_at,
            finished_at=datetime.now(timezone.utc),
        )
        session.add(fetch_log)
        await session.commit()

        return {
            "status": "success",
            "channels_processed": channels_processed,
            "api_units_used": api_units_used,
        }

    except QuotaExceededException as e:
        logger.error("Quota exceeded during channel snapshot job: %s", e)
        fetch_log = FetchLog(
            job_name="channel_snapshot",
            status="failed",
            channels_processed=channels_processed,
            videos_processed=0,
            api_units_used=api_units_used,
            error_message=str(e),
            started_at=started_at,
            finished_at=datetime.now(timezone.utc),
        )
        session.add(fetch_log)
        await session.commit()

        return {
            "status": "failed",
            "channels_processed": channels_processed,
            "api_units_used": api_units_used,
            "error": str(e),
        }
