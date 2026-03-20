import pytest
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy import select

from youtube_monitor.models.channel import Channel
from youtube_monitor.models.video import Video
from youtube_monitor.models.fetch_log import FetchLog
from youtube_monitor.collector.jobs.discover_videos import run_discover_videos_job
from youtube_monitor.collector.youtube_client import QuotaExceededException


KNOWN_DATE = date(2026, 3, 20)
PATCH_TARGET = "youtube_monitor.collector.jobs.discover_videos.get_taipei_date"


async def _add_active_channel(
    session,
    youtube_channel_id: str,
    name: str = "Channel",
    uploads_playlist_id: str = None,
) -> Channel:
    """Insert an active channel and return it."""
    channel = Channel(
        youtube_channel_id=youtube_channel_id,
        channel_name=name,
        status="active",
        source="manual",
        uploads_playlist_id=uploads_playlist_id,
    )
    session.add(channel)
    await session.commit()
    result = await session.execute(
        select(Channel).where(Channel.youtube_channel_id == youtube_channel_id)
    )
    return result.scalar_one()


def make_video_details(
    video_ids: list[str], channel_youtube_id: str = "UC_test"
) -> list[dict]:
    """Build a list of mock video detail dicts."""
    return [
        {
            "youtube_video_id": vid,
            "title": f"Video {vid}",
            "description": "Test video",
            "published_at": datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc),
            "duration": "PT5M",
            "tags": [],
            "topic_categories": [],
            "status": "public",
        }
        for vid in video_ids
    ]


async def test_discover_new_videos(db_session):
    """10 new video IDs from playlist → 10 videos written, rapid_tracking_until = today+7."""
    channel = await _add_active_channel(
        db_session,
        "UC_discover_1",
        "Discover Channel 1",
        uploads_playlist_id="PL_discover_1",
    )

    new_ids = [f"vid{i:04d}ABCDE" for i in range(10)]
    mock_client = MagicMock()
    mock_client.get_uploads_playlist_items = AsyncMock(return_value=new_ids)
    mock_client.get_video_details = AsyncMock(return_value=make_video_details(new_ids))

    with patch(PATCH_TARGET, return_value=KNOWN_DATE):
        result = await run_discover_videos_job(db_session, mock_client)

    assert result["status"] == "success"
    assert result["videos_processed"] == 10

    videos = (await db_session.execute(select(Video))).scalars().all()
    assert len(videos) == 10

    expected_rapid_until = date(2026, 3, 27)  # KNOWN_DATE + 7
    for video in videos:
        assert video.rapid_tracking_until == expected_rapid_until
        assert video.channel_id == channel.id
        assert video.status == "public"

    # Verify get_video_details was called with all 10 new IDs
    mock_client.get_video_details.assert_called_once_with(new_ids)


async def test_discover_no_new_videos(db_session):
    """All video IDs already in DB → get_video_details NOT called."""
    channel = await _add_active_channel(
        db_session,
        "UC_discover_2",
        "Discover Channel 2",
        uploads_playlist_id="PL_discover_2",
    )

    existing_ids = [f"exist{i:05d}AB" for i in range(5)]

    # Pre-insert videos as already existing
    for vid_id in existing_ids:
        from sqlalchemy.dialects.sqlite import insert as sqlite_insert

        stmt = sqlite_insert(Video).values(
            youtube_video_id=vid_id,
            channel_id=channel.id,
            title=f"Existing {vid_id}",
            status="public",
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["youtube_video_id"],
            set_={"title": stmt.excluded.title},
        )
        await db_session.execute(stmt)
    await db_session.commit()

    mock_client = MagicMock()
    mock_client.get_uploads_playlist_items = AsyncMock(return_value=existing_ids)
    mock_client.get_video_details = AsyncMock(return_value=[])

    with patch(PATCH_TARGET, return_value=KNOWN_DATE):
        result = await run_discover_videos_job(db_session, mock_client)

    assert result["status"] == "success"
    assert result["videos_processed"] == 0

    # get_video_details must NOT have been called (no new IDs to fetch)
    mock_client.get_video_details.assert_not_called()


async def test_discover_empty_playlist(db_session):
    """Playlist returns [] → graceful exit, no error, no videos created."""
    await _add_active_channel(
        db_session,
        "UC_discover_3",
        "Discover Channel 3",
        uploads_playlist_id="PL_discover_3",
    )

    mock_client = MagicMock()
    mock_client.get_uploads_playlist_items = AsyncMock(return_value=[])
    mock_client.get_video_details = AsyncMock(return_value=[])

    with patch(PATCH_TARGET, return_value=KNOWN_DATE):
        result = await run_discover_videos_job(db_session, mock_client)

    assert result["status"] == "success"
    assert result["videos_processed"] == 0

    videos = (await db_session.execute(select(Video))).scalars().all()
    assert len(videos) == 0

    mock_client.get_video_details.assert_not_called()


async def test_discover_caps_at_200_videos(db_session):
    """Playlist returns 200 IDs (mock already caps at max_pages=4 = 200 videos)."""
    await _add_active_channel(
        db_session,
        "UC_discover_4",
        "Discover Channel 4",
        uploads_playlist_id="PL_discover_4",
    )

    # Mock returns exactly 200 IDs (max_pages=4 * 50 per page)
    capped_ids = [f"cap{i:05d}ABCD" for i in range(200)]
    mock_client = MagicMock()
    mock_client.get_uploads_playlist_items = AsyncMock(return_value=capped_ids)
    mock_client.get_video_details = AsyncMock(
        return_value=make_video_details(capped_ids)
    )

    with patch(PATCH_TARGET, return_value=KNOWN_DATE):
        result = await run_discover_videos_job(db_session, mock_client)

    assert result["status"] == "success"
    assert result["videos_processed"] == 200

    # Verify get_uploads_playlist_items was called with max_pages=4
    mock_client.get_uploads_playlist_items.assert_called_once_with(
        "PL_discover_4", max_pages=4
    )

    videos = (await db_session.execute(select(Video))).scalars().all()
    assert len(videos) == 200


async def test_rapid_tracking_set(db_session):
    """New video has rapid_tracking_until == today+7."""
    await _add_active_channel(
        db_session,
        "UC_discover_5",
        "Discover Channel 5",
        uploads_playlist_id="PL_discover_5",
    )

    single_id = ["newvideo12AB"]
    mock_client = MagicMock()
    mock_client.get_uploads_playlist_items = AsyncMock(return_value=single_id)
    mock_client.get_video_details = AsyncMock(
        return_value=make_video_details(single_id)
    )

    known_date = date(2026, 3, 15)
    with patch(PATCH_TARGET, return_value=known_date):
        await run_discover_videos_job(db_session, mock_client)

    result = await db_session.execute(
        select(Video).where(Video.youtube_video_id == "newvideo12AB")
    )
    video = result.scalar_one()
    assert video.rapid_tracking_until == date(2026, 3, 22)  # 2026-03-15 + 7 days
