import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from youtube_monitor.models.channel import Channel
from youtube_monitor.models.video import Video
from youtube_monitor.models.video_snapshot import VideoSnapshot
from youtube_monitor.models.fetch_log import FetchLog
from youtube_monitor.collector.youtube_client import (
    YouTubeClient,
    QuotaExceededException,
)
from youtube_monitor.collector.utils import get_taipei_date

logger = logging.getLogger(__name__)
TAIPEI_TZ = ZoneInfo("Asia/Taipei")


async def run_discover_videos_job(
    session: AsyncSession,
    youtube_client: YouTubeClient,
    channel_id: int | None = None,
    current_hour: int | None = None,
) -> dict:
    """
    Daily video discovery job (runs at 06:00 Taipei time).

    Args:
        session: Async SQLAlchemy session.
        youtube_client: YouTube API client.
        channel_id: If provided, only process the channel with this DB id.
                    If None (default), all active channels are processed.

    Flow:
    1. Query all channels with status='active' (filtered by channel_id if given)
    2. For each channel:
       a. Get uploads_playlist_id (from DB or API)
       b. Fetch up to 200 video IDs from the uploads playlist
       c. Filter out video IDs already in DB
       d. If no new videos → skip (no API call)
       e. Fetch details for new video IDs only
       f. Upsert new videos with rapid_tracking_until = today+7
    3. Write one fetch_log per channel with job_name='discover_videos'
    4. On QuotaExceededException → stop immediately, write fetch_log status='failed'

    Returns: dict with job stats
    """
    if current_hour is None:
        current_hour = datetime.now(TAIPEI_TZ).hour

    started_at = datetime.now(timezone.utc)
    today = get_taipei_date()
    total_videos_processed = 0
    api_units_used = 0

    query = select(Channel).where(Channel.status == "active")
    if channel_id is not None:
        query = query.where(Channel.id == channel_id)
    else:
        query = query.where(Channel.schedule_hour == current_hour)
    result = await session.execute(query)
    active_channels = result.scalars().all()

    try:
        for channel in active_channels:
            ch_started_at = datetime.now(timezone.utc)
            ch_videos = 0
            ch_units = 0
            ch_status = "success"
            ch_error = None

            try:
                # Step 1: Get uploads_playlist_id
                playlist_id = channel.uploads_playlist_id
                if not playlist_id:
                    # Need to call the API to get it
                    channel_data = await youtube_client.get_channel_info(
                        channel.youtube_channel_id
                    )
                    ch_units += 1
                    api_units_used += 1

                    if channel_data is None:
                        logger.warning(
                            "Channel %s not found on YouTube, skipping",
                            channel.youtube_channel_id,
                        )
                        ch_status = "failed"
                        ch_error = "Channel not found on YouTube"
                    else:
                        playlist_id = channel_data.get("uploads_playlist_id", "")
                        if not playlist_id:
                            logger.warning(
                                "No uploads playlist for channel %s, skipping",
                                channel.youtube_channel_id,
                            )
                            ch_status = "failed"
                            ch_error = "No uploads playlist found"
                        else:
                            # Persist uploads_playlist_id immediately
                            await session.execute(
                                update(Channel)
                                .where(Channel.id == channel.id)
                                .values(uploads_playlist_id=playlist_id)
                            )
                            await session.commit()

                if playlist_id and ch_status == "success":
                    # Step 2: Fetch video IDs from playlist (up to 200, max_pages=4)
                    video_ids = await youtube_client.get_uploads_playlist_items(
                        playlist_id, max_pages=4
                    )
                    pages_used = min(len(video_ids) // 50 + 1, 4)
                    ch_units += pages_used
                    api_units_used += pages_used

                    if not video_ids:
                        logger.debug(
                            "Empty playlist for channel %s, skipping",
                            channel.youtube_channel_id,
                        )
                    else:
                        # Step 3: Filter out video IDs already in DB
                        existing_result = await session.execute(
                            select(Video.youtube_video_id).where(
                                Video.youtube_video_id.in_(video_ids)
                            )
                        )
                        existing_ids = set(existing_result.scalars().all())
                        new_video_ids = [vid for vid in video_ids if vid not in existing_ids]

                        if new_video_ids:
                            # Step 4: Fetch details for new videos only
                            video_details = await youtube_client.get_video_details(new_video_ids)
                            detail_units = max(1, (len(new_video_ids) + 49) // 50)
                            ch_units += detail_units
                            api_units_used += detail_units

                            # Step 5: Upsert new videos and create initial VideoSnapshot
                            crawled_at = datetime.now(timezone.utc)
                            for video_data in video_details:
                                yt_video_id = video_data["youtube_video_id"]
                                pub_at = video_data.get("published_at")
                                video_schedule_hour = (
                                    (pub_at.astimezone(TAIPEI_TZ).hour + 1) % 24 if pub_at else current_hour
                                )
                                stmt = sqlite_insert(Video).values(
                                    youtube_video_id=yt_video_id,
                                    channel_id=channel.id,
                                    title=video_data.get("title"),
                                    description=video_data.get("description"),
                                    published_at=pub_at,
                                    duration=video_data.get("duration"),
                                    tags=video_data.get("tags"),
                                    topic_categories=video_data.get("topic_categories"),
                                    status="public",
                                    schedule_hour=video_schedule_hour,
                                    # rapid_tracking_until intentionally omitted
                                )
                                stmt = stmt.on_conflict_do_update(
                                    index_elements=["youtube_video_id"],
                                    set_={
                                        "title": stmt.excluded.title,
                                        "description": stmt.excluded.description,
                                        "published_at": stmt.excluded.published_at,
                                        "duration": stmt.excluded.duration,
                                        "tags": stmt.excluded.tags,
                                        "topic_categories": stmt.excluded.topic_categories,
                                        "status": stmt.excluded.status,
                                        "schedule_hour": stmt.excluded.schedule_hour,
                                    },
                                )
                                await session.execute(stmt)

                                video_result = await session.execute(
                                    select(Video.id).where(Video.youtube_video_id == yt_video_id)
                                )
                                video_db_id = video_result.scalar_one()

                                snap_stmt = sqlite_insert(VideoSnapshot).values(
                                    video_id=video_db_id,
                                    snapshot_date=today,
                                    crawled_at=crawled_at,
                                    view_count=video_data.get("view_count"),
                                    like_count=video_data.get("like_count"),
                                    comment_count=video_data.get("comment_count"),
                                )
                                snap_stmt = snap_stmt.on_conflict_do_update(
                                    index_elements=["video_id", "snapshot_date"],
                                    set_={
                                        "crawled_at": snap_stmt.excluded.crawled_at,
                                        "view_count": snap_stmt.excluded.view_count,
                                        "like_count": snap_stmt.excluded.like_count,
                                        "comment_count": snap_stmt.excluded.comment_count,
                                    },
                                )
                                await session.execute(snap_stmt)

                            ch_videos += len(video_details)
                            total_videos_processed += len(video_details)
                            logger.info(
                                "Channel %s: discovered %d new videos",
                                channel.youtube_channel_id,
                                len(video_details),
                            )

            except QuotaExceededException:
                raise
            except Exception as e:
                ch_status = "failed"
                ch_error = str(e)
                logger.error("Error processing channel %s: %s", channel.id, e)

            # Write per-channel fetch log
            ch_log = FetchLog(
                job_name="discover_videos",
                channel_id=channel.id,
                status=ch_status,
                channels_processed=0,
                videos_processed=ch_videos,
                api_units_used=ch_units,
                error_message=ch_error,
                started_at=ch_started_at,
                finished_at=datetime.now(timezone.utc),
            )
            session.add(ch_log)

        await session.commit()

        return {
            "status": "success",
            "channels_processed": len(active_channels),
            "videos_processed": total_videos_processed,
            "api_units_used": api_units_used,
        }

    except QuotaExceededException as e:
        logger.error("Quota exceeded during discover_videos job: %s", e)
        fetch_log = FetchLog(
            job_name="discover_videos",
            channel_id=channel_id,
            status="failed",
            channels_processed=0,
            videos_processed=total_videos_processed,
            api_units_used=api_units_used,
            error_message=str(e),
            started_at=started_at,
            finished_at=datetime.now(timezone.utc),
        )
        session.add(fetch_log)
        await session.commit()

        return {
            "status": "failed",
            "videos_processed": total_videos_processed,
            "api_units_used": api_units_used,
            "error": str(e),
        }

    except Exception as e:
        logger.error("Unexpected error during discover_videos job: %s", e)
        fetch_log = FetchLog(
            job_name="discover_videos",
            channel_id=channel_id,
            status="failed",
            channels_processed=0,
            videos_processed=total_videos_processed,
            api_units_used=api_units_used,
            error_message=str(e),
            started_at=started_at,
            finished_at=datetime.now(timezone.utc),
        )
        session.add(fetch_log)
        await session.commit()
        raise
