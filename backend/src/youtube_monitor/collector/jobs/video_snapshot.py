import json
import logging
from datetime import datetime, timezone
from collections import defaultdict
from zoneinfo import ZoneInfo
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

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


async def run_video_snapshot_job(
    session: AsyncSession,
    youtube_client: YouTubeClient,
    channel_id: int | None = None,
    current_hour: int | None = None,
) -> dict:
    """
    Hourly video statistics snapshot job.

    Args:
        session: Async SQLAlchemy session.
        youtube_client: YouTube API client.
        channel_id: If provided, only snapshot videos belonging to this channel DB id.
                    If None (default), all eligible videos are processed.
        current_hour: Taipei hour used to filter videos by schedule_hour.
                      Defaults to the current Taipei hour.

    Flow:
    1. Query public videos where schedule_hour == current_hour
    2. Batch video IDs into groups of 50
    3. Call youtube_client.get_video_details(batch) for each batch
    4. Videos missing from API response → set status='private'
    5. Upsert video_snapshots for each returned video (with crawled_at)
    6. Write one fetch_log per channel
    7. On QuotaExceededException → fetch_log status='failed', stop immediately

    Returns: dict with job stats
    """
    if current_hour is None:
        current_hour = datetime.now(TAIPEI_TZ).hour

    started_at = datetime.now(timezone.utc)
    today = get_taipei_date()
    videos_processed = 0
    api_units_used = 0

    query = select(Video).where(Video.status == "public")
    if channel_id is not None:
        query = query.where(Video.channel_id == channel_id)
    else:
        query = query.where(Video.schedule_hour == current_hour)

    result = await session.execute(query)
    videos_to_snapshot = result.scalars().all()

    if not videos_to_snapshot:
        return {"status": "success", "videos_processed": 0, "api_units_used": 0}

    # Build lookup: youtube_video_id → Video object
    video_lookup: dict[str, Video] = {v.youtube_video_id: v for v in videos_to_snapshot}
    all_youtube_ids = list(video_lookup.keys())

    # Track per-channel stats for FetchLog
    channel_videos_processed: dict[int, int] = defaultdict(int)
    channel_started_at: dict[int, datetime] = {
        v.channel_id: started_at for v in videos_to_snapshot
    }
    channel_video_ids: dict[int, list[str]] = defaultdict(list)
    channel_api_outputs: dict[int, list] = defaultdict(list)

    try:
        returned_youtube_ids: set[str] = set()
        crawled_at = datetime.now(timezone.utc)

        # Batch into groups of 50
        for i in range(0, len(all_youtube_ids), 50):
            batch = all_youtube_ids[i : i + 50]
            video_details = await youtube_client.get_video_details(batch)
            api_units_used += 1
            crawled_at = datetime.now(timezone.utc)

            for detail in video_details:
                yt_id = detail["youtube_video_id"]
                returned_youtube_ids.add(yt_id)
                video = video_lookup[yt_id]

                channel_video_ids[video.channel_id].append(yt_id)
                channel_api_outputs[video.channel_id].append(detail)

                # Upsert VideoSnapshot with crawled_at
                stmt = sqlite_insert(VideoSnapshot).values(
                    video_id=video.id,
                    snapshot_date=today,
                    crawled_at=crawled_at,
                    view_count=detail["view_count"],
                    like_count=detail["like_count"],
                    comment_count=detail["comment_count"],
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=["video_id", "snapshot_date"],
                    set_={
                        "crawled_at": stmt.excluded.crawled_at,
                        "view_count": stmt.excluded.view_count,
                        "like_count": stmt.excluded.like_count,
                        "comment_count": stmt.excluded.comment_count,
                    },
                )
                await session.execute(stmt)
                videos_processed += 1
                channel_videos_processed[video.channel_id] += 1

            # Videos in batch but NOT returned by API → gone private
            for yt_id in batch:
                if yt_id not in returned_youtube_ids:
                    video = video_lookup[yt_id]
                    await session.execute(
                        update(Video)
                        .where(Video.id == video.id)
                        .values(status="private")
                    )
                    logger.info("Video %s not returned by API → marked private", yt_id)

        # Write per-channel fetch logs
        finished_at = datetime.now(timezone.utc)
        for ch_id, ch_videos in channel_videos_processed.items():
            ch_log = FetchLog(
                job_name="video_snapshot",
                channel_id=ch_id,
                status="success",
                channels_processed=0,
                videos_processed=ch_videos,
                api_units_used=0,
                error_message=None,
                started_at=channel_started_at.get(ch_id, started_at),
                finished_at=finished_at,
                input_payload=json.dumps(
                    {"video_ids": channel_video_ids.get(ch_id, [])}
                ),
                output_payload=json.dumps(channel_api_outputs.get(ch_id, [])),
                video_ids=json.dumps(channel_video_ids.get(ch_id, [])),
            )
            session.add(ch_log)

        await session.commit()

        return {
            "status": "success",
            "videos_processed": videos_processed,
            "api_units_used": api_units_used,
        }

    except QuotaExceededException as e:
        logger.error("Quota exceeded during video_snapshot job: %s", e)
        fetch_log = FetchLog(
            job_name="video_snapshot",
            channel_id=channel_id,
            status="failed",
            channels_processed=0,
            videos_processed=videos_processed,
            api_units_used=api_units_used,
            error_message=str(e),
            started_at=started_at,
            finished_at=datetime.now(timezone.utc),
            input_payload=None,
            output_payload=None,
            video_ids=None,
        )
        session.add(fetch_log)
        await session.commit()

        return {
            "status": "failed",
            "videos_processed": videos_processed,
            "api_units_used": api_units_used,
            "error": str(e),
        }

    except Exception as e:
        logger.error("Unexpected error during video_snapshot job: %s", e)
        fetch_log = FetchLog(
            job_name="video_snapshot",
            channel_id=channel_id,
            status="failed",
            channels_processed=0,
            videos_processed=videos_processed,
            api_units_used=api_units_used,
            error_message=str(e),
            started_at=started_at,
            finished_at=datetime.now(timezone.utc),
            input_payload=None,
            output_payload=None,
            video_ids=None,
        )
        session.add(fetch_log)
        await session.commit()
        raise
