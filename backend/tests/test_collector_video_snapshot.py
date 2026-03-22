from unittest.mock import AsyncMock, MagicMock, patch
from datetime import date, datetime, timezone
from sqlalchemy import select

from youtube_monitor.models.channel import Channel
from youtube_monitor.models.video import Video
from youtube_monitor.models.video_snapshot import VideoSnapshot
from youtube_monitor.models.fetch_log import FetchLog
from youtube_monitor.collector.jobs.video_snapshot import run_video_snapshot_job


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TODAY = date(2026, 3, 20)
TODAY_DT = datetime(2026, 3, 20, tzinfo=timezone.utc)


async def _add_channel(session) -> Channel:
    channel = Channel(
        youtube_channel_id="UC_test_channel",
        channel_name="Test Channel",
        status="active",
        source="manual",
    )
    session.add(channel)
    await session.commit()
    result = await session.execute(
        select(Channel).where(Channel.youtube_channel_id == "UC_test_channel")
    )
    return result.scalar_one()


async def _add_video(
    session,
    channel_id: int,
    youtube_video_id: str,
    published_at: datetime,
    rapid_tracking_until=None,
    status: str = "public",
) -> Video:
    video = Video(
        youtube_video_id=youtube_video_id,
        channel_id=channel_id,
        title=f"Video {youtube_video_id}",
        published_at=published_at,
        status=status,
        rapid_tracking_until=rapid_tracking_until,
    )
    session.add(video)
    await session.commit()
    result = await session.execute(
        select(Video).where(Video.youtube_video_id == youtube_video_id)
    )
    return result.scalar_one()


def make_video_detail(
    youtube_video_id: str, view_count=1000, like_count=50, comment_count=10
) -> dict:
    return {
        "youtube_video_id": youtube_video_id,
        "view_count": view_count,
        "like_count": like_count,
        "comment_count": comment_count,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_video_snapshot_success(db_session):
    """5 public videos published within 30 days → all get snapshots written."""
    channel = await _add_channel(db_session)

    # 5 videos published 10 days ago (Tier B: within 30 days)
    recent_dt = datetime(2026, 3, 10, tzinfo=timezone.utc)
    video_ids = [f"vid{i}" for i in range(1, 6)]
    for vid_id in video_ids:
        await _add_video(db_session, channel.id, vid_id, published_at=recent_dt)

    mock_client = MagicMock()
    mock_client.get_video_details = AsyncMock(
        return_value=[make_video_detail(vid_id) for vid_id in video_ids]
    )

    with patch(
        "youtube_monitor.collector.jobs.video_snapshot.get_taipei_date",
        return_value=TODAY,
    ):
        result = await run_video_snapshot_job(db_session, mock_client)

    assert result["status"] == "success"
    assert result["videos_processed"] == 5

    snapshots = (await db_session.execute(select(VideoSnapshot))).scalars().all()
    assert len(snapshots) == 5

    logs = (await db_session.execute(select(FetchLog))).scalars().all()
    assert len(logs) == 1
    assert logs[0].job_name == "video_snapshot"
    assert logs[0].status == "success"
    assert logs[0].videos_processed == 5


async def test_video_snapshot_idempotent(db_session):
    """Running the job twice with same data produces 5 snapshots (not 10) via upsert."""
    channel = await _add_channel(db_session)

    recent_dt = datetime(2026, 3, 10, tzinfo=timezone.utc)
    video_ids = [f"idem{i}" for i in range(1, 6)]
    for vid_id in video_ids:
        await _add_video(db_session, channel.id, vid_id, published_at=recent_dt)

    def make_client():
        mock = MagicMock()
        mock.get_video_details = AsyncMock(
            return_value=[make_video_detail(vid_id) for vid_id in video_ids]
        )
        return mock

    with patch(
        "youtube_monitor.collector.jobs.video_snapshot.get_taipei_date",
        return_value=TODAY,
    ):
        await run_video_snapshot_job(db_session, make_client())

    with patch(
        "youtube_monitor.collector.jobs.video_snapshot.get_taipei_date",
        return_value=TODAY,
    ):
        await run_video_snapshot_job(db_session, make_client())

    snapshots = (await db_session.execute(select(VideoSnapshot))).scalars().all()
    assert len(snapshots) == 5, (
        f"Expected 5 snapshots after idempotent run, got {len(snapshots)}"
    )


async def test_video_gone_private(db_session):
    """One video ID missing from API response → that video's status set to 'private'."""
    channel = await _add_channel(db_session)

    recent_dt = datetime(2026, 3, 10, tzinfo=timezone.utc)
    # Create 3 videos; API will only return 2
    vid1 = await _add_video(db_session, channel.id, "gone_vid1", published_at=recent_dt)
    vid2 = await _add_video(db_session, channel.id, "gone_vid2", published_at=recent_dt)
    vid3 = await _add_video(db_session, channel.id, "gone_vid3", published_at=recent_dt)

    mock_client = MagicMock()
    # Only vid1 and vid2 returned — vid3 is gone
    mock_client.get_video_details = AsyncMock(
        return_value=[
            make_video_detail("gone_vid1"),
            make_video_detail("gone_vid2"),
        ]
    )

    with patch(
        "youtube_monitor.collector.jobs.video_snapshot.get_taipei_date",
        return_value=TODAY,
    ):
        result = await run_video_snapshot_job(db_session, mock_client)

    assert result["status"] == "success"

    # vid3 must be marked private
    refreshed = (
        await db_session.execute(select(Video).where(Video.id == vid3.id))
    ).scalar_one()
    assert refreshed.status == "private"

    # vid1 and vid2 should still be public (they have snapshots)
    for vid in [vid1, vid2]:
        refreshed = (
            await db_session.execute(select(Video).where(Video.id == vid.id))
        ).scalar_one()
        assert refreshed.status == "public"

    # 2 snapshots for the 2 returned videos
    snapshots = (await db_session.execute(select(VideoSnapshot))).scalars().all()
    assert len(snapshots) == 2


async def test_video_rapid_tracking_included(db_session):
    """Video with rapid_tracking_until=today+3 is included in snapshot batch (Tier A)."""
    channel = await _add_channel(db_session)

    # Publish an OLD video (>30 days) but give it rapid tracking
    old_dt = datetime(2026, 1, 1, tzinfo=timezone.utc)
    rapid_until = date(2026, 3, 23)  # today + 3
    rapid_video = await _add_video(
        db_session,
        channel.id,
        "rapid_vid1",
        published_at=old_dt,
        rapid_tracking_until=rapid_until,
    )

    mock_client = MagicMock()
    mock_client.get_video_details = AsyncMock(
        return_value=[make_video_detail("rapid_vid1")]
    )

    with patch(
        "youtube_monitor.collector.jobs.video_snapshot.get_taipei_date",
        return_value=TODAY,
    ):
        result = await run_video_snapshot_job(db_session, mock_client)

    assert result["status"] == "success"
    assert result["videos_processed"] == 1

    # Verify the rapid video was passed to get_video_details
    mock_client.get_video_details.assert_called_once()
    batch = mock_client.get_video_details.call_args[0][0]
    assert "rapid_vid1" in batch

    # Snapshot was written
    snapshots = (await db_session.execute(select(VideoSnapshot))).scalars().all()
    assert len(snapshots) == 1
    assert snapshots[0].video_id == rapid_video.id


async def test_video_downsampling(db_session):
    """Tier C video (published 60 days ago) that already has a snapshot this week → NOT included."""
    channel = await _add_channel(db_session)

    # Old video (Tier C: > 30 days)
    old_dt = datetime(2026, 1, 19, tzinfo=timezone.utc)  # ~60 days before TODAY
    old_video = await _add_video(
        db_session,
        channel.id,
        "old_vid1",
        published_at=old_dt,
        rapid_tracking_until=None,
    )

    # Pre-insert a VideoSnapshot from 2 days ago (within the same ISO week as TODAY)
    # TODAY = 2026-03-20 (Friday), week starts 2026-03-16 (Monday)
    snapshot_in_week = VideoSnapshot(
        video_id=old_video.id,
        snapshot_date=date(2026, 3, 18),  # Wednesday of same week
        view_count=900,
        like_count=40,
        comment_count=5,
    )
    db_session.add(snapshot_in_week)
    await db_session.commit()

    mock_client = MagicMock()
    mock_client.get_video_details = AsyncMock(return_value=[])

    with patch(
        "youtube_monitor.collector.jobs.video_snapshot.get_taipei_date",
        return_value=TODAY,
    ):
        result = await run_video_snapshot_job(db_session, mock_client)

    assert result["status"] == "success"

    # get_video_details should NOT have been called (no videos to snapshot)
    mock_client.get_video_details.assert_not_called()

    # Still only 1 snapshot (the pre-inserted one)
    snapshots = (await db_session.execute(select(VideoSnapshot))).scalars().all()
    assert len(snapshots) == 1
    assert snapshots[0].snapshot_date == date(2026, 3, 18)
