import logging
import math
from datetime import datetime, timezone, timedelta
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


async def run_video_snapshot_job(
    session: AsyncSession,
    youtube_client: YouTubeClient,
    channel_id: int | None = None,
) -> dict:
    """
    Daily video statistics snapshot job (runs at 08:00 Taipei time).

    Args:
        session: Async SQLAlchemy session.
        youtube_client: YouTube API client.
        channel_id: If provided, only snapshot videos belonging to this channel DB id.
                    If None (default), all eligible videos are processed.

    Flow:
    1. Query videos to snapshot using 3-tier strategy:
       Tier A: rapid_tracking_until >= today  → ALWAYS include
       Tier B: published_at >= today - 30 days AND rapid_tracking_until is null or < today → daily update
       Tier C: published_at < today - 30 days → downsampled: skip if already has a VideoSnapshot this ISO week
    2. Batch video IDs into groups of 50
    3. Call youtube_client.get_video_details(batch) for each batch
    4. Videos missing from API response → set status='private'
    5. Upsert video_snapshots for each returned video
    6. Write fetch_log
    7. On QuotaExceededException → fetch_log status='failed', stop immediately

    Returns: dict with job stats
    """
    started_at = datetime.now(timezone.utc)
    today = get_taipei_date()
    videos_processed = 0
    api_units_used = 0

    # --- Tier A: rapid_tracking_until >= today (always include) ---
    tier_a_query = select(Video).where(
        Video.rapid_tracking_until >= today,
        Video.status == "public",
    )
    if channel_id is not None:
        tier_a_query = tier_a_query.where(Video.channel_id == channel_id)
    tier_a_result = await session.execute(tier_a_query)
    tier_a_videos = tier_a_result.scalars().all()

    # --- Tier B: published within last 30 days, not on rapid tracking ---
    cutoff_30 = today - timedelta(days=30)
    tier_b_query = select(Video).where(
        Video.published_at
        >= datetime(
            cutoff_30.year, cutoff_30.month, cutoff_30.day, tzinfo=timezone.utc
        ),
        (Video.rapid_tracking_until == None) | (Video.rapid_tracking_until < today),  # noqa: E711
        Video.status == "public",
    )
    if channel_id is not None:
        tier_b_query = tier_b_query.where(Video.channel_id == channel_id)
    tier_b_result = await session.execute(tier_b_query)
    tier_b_videos = tier_b_result.scalars().all()

    # --- Tier C: published > 30 days ago — downsample: skip if already has snapshot this ISO week ---
    tier_c_query = select(Video).where(
        Video.published_at
        < datetime(cutoff_30.year, cutoff_30.month, cutoff_30.day, tzinfo=timezone.utc),
        Video.status == "public",
    )
    if channel_id is not None:
        tier_c_query = tier_c_query.where(Video.channel_id == channel_id)
    tier_c_result = await session.execute(tier_c_query)
    tier_c_all = tier_c_result.scalars().all()

    # Downsampling: only include Tier C videos that don't have a snapshot this ISO calendar week
    week_start = today - timedelta(days=today.weekday())
    tier_c_videos = []
    for video in tier_c_all:
        existing = await session.execute(
            select(VideoSnapshot).where(
                VideoSnapshot.video_id == video.id,
                VideoSnapshot.snapshot_date >= week_start,
            )
        )
        if existing.scalar():
            logger.debug(
                "Skipping video %s (Tier C: already snapshotted this week)",
                video.youtube_video_id,
            )
            continue
        tier_c_videos.append(video)

    # Combine all tiers, deduplicate by video id
    seen_ids = set()
    videos_to_snapshot = []
    for video in tier_a_videos + tier_b_videos + tier_c_videos:
        if video.id not in seen_ids:
            seen_ids.add(video.id)
            videos_to_snapshot.append(video)

    if not videos_to_snapshot:
        fetch_log = FetchLog(
            job_name="video_snapshot",
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
        return {"status": "success", "videos_processed": 0, "api_units_used": 0}

    # Build lookup: youtube_video_id → Video object
    video_lookup: dict[str, Video] = {v.youtube_video_id: v for v in videos_to_snapshot}
    all_youtube_ids = list(video_lookup.keys())

    try:
        returned_youtube_ids: set[str] = set()

        # Batch into groups of 50
        for i in range(0, len(all_youtube_ids), 50):
            batch = all_youtube_ids[i : i + 50]
            video_details = await youtube_client.get_video_details(batch)
            api_units_used += 1

            for detail in video_details:
                yt_id = detail["youtube_video_id"]
                returned_youtube_ids.add(yt_id)
                video = video_lookup[yt_id]

                # Upsert VideoSnapshot
                stmt = sqlite_insert(VideoSnapshot).values(
                    video_id=video.id,
                    snapshot_date=today,
                    view_count=detail["view_count"],
                    like_count=detail["like_count"],
                    comment_count=detail["comment_count"],
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=["video_id", "snapshot_date"],
                    set_={
                        "view_count": stmt.excluded.view_count,
                        "like_count": stmt.excluded.like_count,
                        "comment_count": stmt.excluded.comment_count,
                    },
                )
                await session.execute(stmt)
                videos_processed += 1

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

        # Write success fetch_log
        fetch_log = FetchLog(
            job_name="video_snapshot",
            status="success",
            channels_processed=0,
            videos_processed=videos_processed,
            api_units_used=api_units_used,
            error_message=None,
            started_at=started_at,
            finished_at=datetime.now(timezone.utc),
        )
        session.add(fetch_log)
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
            status="failed",
            channels_processed=0,
            videos_processed=videos_processed,
            api_units_used=api_units_used,
            error_message=str(e),
            started_at=started_at,
            finished_at=datetime.now(timezone.utc),
        )
        session.add(fetch_log)
        await session.commit()

        return {
            "status": "failed",
            "videos_processed": videos_processed,
            "api_units_used": api_units_used,
            "error": str(e),
        }
