import logging
from datetime import datetime, timezone, timedelta
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


async def run_discover_videos_job(
    session: AsyncSession,
    youtube_client: YouTubeClient,
    channel_id: int | None = None,
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
    3. Write fetch_log with job_name='discover_videos'
    4. On QuotaExceededException → stop immediately, write fetch_log status='failed'

    Returns: dict with job stats
    """
    started_at = datetime.now(timezone.utc)
    today = get_taipei_date()
    total_videos_processed = 0
    api_units_used = 0

    query = select(Channel).where(Channel.status == "active")
    if channel_id is not None:
        query = query.where(Channel.id == channel_id)
    result = await session.execute(query)
    active_channels = result.scalars().all()

    try:
        for channel in active_channels:
            # Step 1: Get uploads_playlist_id
            playlist_id = channel.uploads_playlist_id
            if not playlist_id:
                # Need to call the API to get it
                channel_data = await youtube_client.get_channel_info(
                    channel.youtube_channel_id
                )
                api_units_used += 1

                if channel_data is None:
                    logger.warning(
                        "Channel %s not found on YouTube, skipping",
                        channel.youtube_channel_id,
                    )
                    continue

                playlist_id = channel_data.get("uploads_playlist_id", "")
                if not playlist_id:
                    logger.warning(
                        "No uploads playlist for channel %s, skipping",
                        channel.youtube_channel_id,
                    )
                    continue

                # Persist uploads_playlist_id immediately so it survives
                # even if the later video-discovery steps fail
                await session.execute(
                    update(Channel)
                    .where(Channel.id == channel.id)
                    .values(uploads_playlist_id=playlist_id)
                )
                await session.commit()

            # Step 2: Fetch video IDs from playlist (up to 200, max_pages=4)
            video_ids = await youtube_client.get_uploads_playlist_items(
                playlist_id, max_pages=4
            )
            api_units_used += min(len(video_ids) // 50 + 1, 4)  # 1 unit per page call

            if not video_ids:
                logger.debug(
                    "Empty playlist for channel %s, skipping",
                    channel.youtube_channel_id,
                )
                continue

            # Step 3: Filter out video IDs already in DB
            existing_result = await session.execute(
                select(Video.youtube_video_id).where(
                    Video.youtube_video_id.in_(video_ids)
                )
            )
            existing_ids = set(existing_result.scalars().all())
            new_video_ids = [vid for vid in video_ids if vid not in existing_ids]

            # Step 4: If no new videos, skip
            if not new_video_ids:
                logger.debug("No new videos for channel %s", channel.youtube_channel_id)
                continue

            # Step 5: Fetch details for new videos only
            video_details = await youtube_client.get_video_details(new_video_ids)
            api_units_used += max(1, (len(new_video_ids) + 49) // 50)

            # Step 6: Upsert new videos and create initial VideoSnapshot
            rapid_until = today + timedelta(days=7)
            for video_data in video_details:
                yt_video_id = video_data["youtube_video_id"]
                stmt = sqlite_insert(Video).values(
                    youtube_video_id=yt_video_id,
                    channel_id=channel.id,
                    title=video_data.get("title"),
                    description=video_data.get("description"),
                    published_at=video_data.get("published_at"),
                    duration=video_data.get("duration"),
                    tags=video_data.get("tags"),
                    topic_categories=video_data.get("topic_categories"),
                    status="public",
                    rapid_tracking_until=rapid_until,
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
                        "rapid_tracking_until": stmt.excluded.rapid_tracking_until,
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
                    view_count=video_data.get("view_count"),
                    like_count=video_data.get("like_count"),
                    comment_count=video_data.get("comment_count"),
                )
                snap_stmt = snap_stmt.on_conflict_do_update(
                    index_elements=["video_id", "snapshot_date"],
                    set_={
                        "view_count": snap_stmt.excluded.view_count,
                        "like_count": snap_stmt.excluded.like_count,
                        "comment_count": snap_stmt.excluded.comment_count,
                    },
                )
                await session.execute(snap_stmt)

            total_videos_processed += len(video_details)
            logger.info(
                "Channel %s: discovered %d new videos",
                channel.youtube_channel_id,
                len(video_details),
            )

        # All channels processed successfully
        fetch_log = FetchLog(
            job_name="discover_videos",
            status="success",
            channels_processed=len(active_channels),
            videos_processed=total_videos_processed,
            api_units_used=api_units_used,
            error_message=None,
            started_at=started_at,
            finished_at=datetime.now(timezone.utc),
        )
        session.add(fetch_log)
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
