import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from youtube_monitor.models.channel import Channel
from youtube_monitor.models.channel_snapshot import ChannelSnapshot
from youtube_monitor.models.video import Video
from youtube_monitor.models.fetch_log import FetchLog
from youtube_monitor.collector.youtube_client import (
    YouTubeClient,
    QuotaExceededException,
)
from youtube_monitor.collector.utils import get_taipei_date

logger = logging.getLogger(__name__)
TAIPEI_TZ = ZoneInfo("Asia/Taipei")


async def run_channel_snapshot_job(
    session: AsyncSession,
    youtube_client: YouTubeClient,
    channel_id: int | None = None,
    current_hour: int | None = None,
) -> dict:
    """
    Daily channel statistics snapshot job (runs at 04:00 Taipei time).

    Args:
        session: Async SQLAlchemy session.
        youtube_client: YouTube API client.
        channel_id: If provided, only process the channel with this DB id.
                    If None (default), all active channels are processed.

    Flow:
    1. Query all channels with status='active' (filtered by channel_id if given)
    2. For each channel, call get_channel_info sequentially (1 unit per call)
    3. Update Channel fields (channel_name, updated_at)
    4. Upsert ChannelSnapshot for today (UTC+8 date), idempotent via ON CONFLICT DO UPDATE
    5. Channels not returned by API → set status='terminated'
    6. On QuotaExceededException → stop immediately, write fetch_log status='failed'
    7. Write one fetch_log per channel at the end

    Returns: dict with job stats
    """
    if current_hour is None:
        current_hour = datetime.now(TAIPEI_TZ).hour

    started_at = datetime.now(timezone.utc)
    today = get_taipei_date()
    channels_processed = 0
    api_units_used = 0

    query = select(Channel).where(
        Channel.status == "active",
        Channel.schedule_hour == current_hour,
    )
    if channel_id is not None:
        query = query.where(Channel.id == channel_id)
    result = await session.execute(query)
    active_channels = result.scalars().all()

    if not active_channels:
        return {"status": "success", "channels_processed": 0, "api_units_used": 0}

    try:
        for channel in active_channels:
            ch_started_at = datetime.now(timezone.utc)
            ch_status = "success"
            ch_error = None

            try:
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
                else:
                    # Update channel fields
                    await session.execute(
                        update(Channel)
                        .where(Channel.id == channel.id)
                        .values(
                            channel_name=data["channel_name"],
                            description=data.get("description"),
                            thumbnail_url=data.get("thumbnail_url"),
                            country=data.get("country"),
                            custom_url=data.get("custom_url"),
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

                    # Run anomaly detection for this channel (non-fatal)
                    try:
                        from youtube_monitor.services.anomaly_detector import AnomalyDetector
                        from youtube_monitor.crud.anomaly import create_anomaly_events
                        from sqlalchemy import select as _select
                        from youtube_monitor.models.channel_snapshot import (
                            ChannelSnapshot as _CS,
                        )

                        snap_result = await session.execute(
                            _select(_CS)
                            .where(_CS.channel_id == channel.id)
                            .order_by(_CS.snapshot_date.desc())
                            .limit(30)
                        )
                        recent_snaps = list(snap_result.scalars().all())
                        if len(recent_snaps) >= 7:
                            detector = AnomalyDetector()
                            events = detector.detect_channel_anomalies(channel.id, recent_snaps)
                            if events:
                                await create_anomaly_events(session, events)
                    except Exception as _e:
                        logger.warning(
                            "Anomaly detection failed for channel %s: %s", channel.id, _e
                        )

                    # Update schedule_hour based on latest video published_at (Taipei)
                    latest_pub_result = await session.execute(
                        select(func.max(Video.published_at))
                        .where(Video.channel_id == channel.id)
                    )
                    latest_pub = latest_pub_result.scalar()
                    if latest_pub:
                        if latest_pub.tzinfo is None:
                            latest_pub = latest_pub.replace(tzinfo=timezone.utc)
                        new_hour = (latest_pub.astimezone(TAIPEI_TZ).hour + 1) % 24
                        await session.execute(
                            update(Channel)
                            .where(Channel.id == channel.id)
                            .values(schedule_hour=new_hour)
                        )

            except QuotaExceededException:
                raise
            except Exception as e:
                ch_status = "failed"
                ch_error = str(e)
                logger.error("Error processing channel %s: %s", channel.id, e)

            # Write per-channel fetch log
            ch_log = FetchLog(
                job_name="channel_snapshot",
                channel_id=channel.id,
                status=ch_status,
                channels_processed=1 if ch_status == "success" else 0,
                videos_processed=0,
                api_units_used=1,
                error_message=ch_error,
                started_at=ch_started_at,
                finished_at=datetime.now(timezone.utc),
            )
            session.add(ch_log)

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
            channel_id=channel_id,
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
