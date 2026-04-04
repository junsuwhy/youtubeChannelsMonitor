import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import date, datetime, timezone
from sqlalchemy import select
import json

from youtube_monitor.models.channel import Channel
from youtube_monitor.models.channel_snapshot import ChannelSnapshot
from youtube_monitor.models.fetch_log import FetchLog
from youtube_monitor.models.video import Video
from youtube_monitor.collector.jobs.channel_snapshot import run_channel_snapshot_job
from youtube_monitor.collector.youtube_client import QuotaExceededException


def make_channel_data(youtube_channel_id: str, name: str = "Test Channel") -> dict:
    """Helper to produce a realistic get_channel_info response dict."""
    return {
        "youtube_channel_id": youtube_channel_id,
        "channel_name": name,
        "description": "A test channel",
        "thumbnail_url": "https://example.com/thumb.jpg",
        "country": "TW",
        "custom_url": "@testchannel",
        "tags": [],
        "topic_categories": [],
        "subscriber_count": 1000,
        "video_count": 50,
        "view_count": 500000,
        "uploads_playlist_id": "UU_test",
    }


async def _add_active_channel(
    session, youtube_channel_id: str, name: str = "Channel"
) -> Channel:
    """Insert an active channel and return it."""
    channel = Channel(
        youtube_channel_id=youtube_channel_id,
        channel_name=name,
        status="active",
        source="manual",
    )
    session.add(channel)
    await session.commit()
    # Re-fetch to get the auto-assigned id
    result = await session.execute(
        select(Channel).where(Channel.youtube_channel_id == youtube_channel_id)
    )
    return result.scalar_one()


async def test_snapshot_job_empty_channels(db_session):
    """No active channels in DB → job returns success with 0 processed, writes NO FetchLog."""
    mock_client = MagicMock()

    result = await run_channel_snapshot_job(db_session, mock_client, current_hour=6)

    logs = (await db_session.execute(select(FetchLog))).scalars().all()
    assert len(logs) == 0, "Empty run should not write FetchLog"
    assert result["status"] == "success"
    assert result["channels_processed"] == 0


async def test_snapshot_job_success(db_session):
    """2 active channels, mock returns data → 2 channel_snapshots, fetch_log status='success'."""
    ch1 = await _add_active_channel(db_session, "UC_channel_1", "Channel One")
    ch2 = await _add_active_channel(db_session, "UC_channel_2", "Channel Two")

    mock_client = MagicMock()
    mock_client.get_channel_info = AsyncMock(
        side_effect=[
            make_channel_data("UC_channel_1", "Channel One Updated"),
            make_channel_data("UC_channel_2", "Channel Two Updated"),
        ]
    )

    result = await run_channel_snapshot_job(db_session, mock_client, current_hour=6)

    # Verify 2 snapshots created
    snapshots = (await db_session.execute(select(ChannelSnapshot))).scalars().all()
    assert len(snapshots) == 2

    channel_ids = {s.channel_id for s in snapshots}
    assert ch1.id in channel_ids
    assert ch2.id in channel_ids

    # Verify all snapshots have expected values
    for snap in snapshots:
        assert snap.subscriber_count == 1000
        assert snap.view_count == 500000
        assert snap.video_count == 50

    # Verify fetch_log: one per channel
    logs = (await db_session.execute(select(FetchLog))).scalars().all()
    assert len(logs) == 2
    assert all(log.status == "success" for log in logs)
    assert all(log.channels_processed == 1 for log in logs)
    assert all(log.api_units_used == 1 for log in logs)
    log_channel_ids = {log.channel_id for log in logs}
    assert ch1.id in log_channel_ids
    assert ch2.id in log_channel_ids
    assert result["status"] == "success"


async def test_snapshot_job_idempotent(db_session):
    """Running the job twice with same data produces 2 snapshots (not 4)."""
    await _add_active_channel(db_session, "UC_channel_idem_1", "Idempotent Ch1")
    await _add_active_channel(db_session, "UC_channel_idem_2", "Idempotent Ch2")

    today = date(2026, 3, 20)

    def make_client():
        mock = MagicMock()
        mock.get_channel_info = AsyncMock(
            side_effect=[
                make_channel_data("UC_channel_idem_1"),
                make_channel_data("UC_channel_idem_2"),
            ]
        )
        return mock

    with patch(
        "youtube_monitor.collector.jobs.channel_snapshot.get_taipei_date",
        return_value=today,
    ):
        await run_channel_snapshot_job(db_session, make_client(), current_hour=6)

    # Re-mock for second run
    with patch(
        "youtube_monitor.collector.jobs.channel_snapshot.get_taipei_date",
        return_value=today,
    ):
        await run_channel_snapshot_job(db_session, make_client(), current_hour=6)

    snapshots = (await db_session.execute(select(ChannelSnapshot))).scalars().all()
    assert len(snapshots) == 2, (
        f"Expected 2 snapshots after idempotent run, got {len(snapshots)}"
    )


async def test_snapshot_job_terminated_channel(db_session):
    """get_channel_info returns None → channel.status = 'terminated'."""
    channel = await _add_active_channel(db_session, "UC_gone_channel", "Gone Channel")

    mock_client = MagicMock()
    mock_client.get_channel_info = AsyncMock(return_value=None)

    await run_channel_snapshot_job(db_session, mock_client, current_hour=6)

    result = await db_session.execute(select(Channel).where(Channel.id == channel.id))
    updated_channel = result.scalar_one()
    assert updated_channel.status == "terminated"

    # No snapshot should be created for terminated channel
    snapshots = (await db_session.execute(select(ChannelSnapshot))).scalars().all()
    assert len(snapshots) == 0


async def test_snapshot_job_quota_exceeded(db_session):
    """QuotaExceededException → fetch_log status='failed', error_message contains quota info."""
    await _add_active_channel(db_session, "UC_quota_ch", "Quota Channel")

    mock_client = MagicMock()
    mock_client.get_channel_info = AsyncMock(
        side_effect=QuotaExceededException("quotaExceeded: daily limit reached")
    )

    result = await run_channel_snapshot_job(db_session, mock_client, current_hour=6)

    logs = (await db_session.execute(select(FetchLog))).scalars().all()
    assert len(logs) == 1
    assert logs[0].status == "failed"
    assert logs[0].error_message is not None
    assert "quota" in logs[0].error_message.lower()
    assert result["status"] == "failed"

    # No snapshots should be created
    snapshots = (await db_session.execute(select(ChannelSnapshot))).scalars().all()
    assert len(snapshots) == 0


async def test_snapshot_date_is_taipei_time(db_session):
    """snapshot_date uses UTC+8 (Taipei time), not UTC."""
    await _add_active_channel(db_session, "UC_taipei_ch", "Taipei Channel")

    known_date = date(2026, 3, 20)

    mock_client = MagicMock()
    mock_client.get_channel_info = AsyncMock(
        return_value=make_channel_data("UC_taipei_ch")
    )

    with patch(
        "youtube_monitor.collector.jobs.channel_snapshot.get_taipei_date",
        return_value=known_date,
    ):
        await run_channel_snapshot_job(db_session, mock_client, current_hour=6)

    snapshots = (await db_session.execute(select(ChannelSnapshot))).scalars().all()
    assert len(snapshots) == 1
    assert snapshots[0].snapshot_date == known_date


@pytest.mark.asyncio
async def test_channel_snapshot_filters_by_schedule_hour(db_session):
    """Only channels with matching schedule_hour are snapshotted."""
    from datetime import date

    ch_match = Channel(
        youtube_channel_id="UC_snap_match",
        channel_name="Match",
        status="active",
        source="manual",
        schedule_hour=4,
    )
    ch_skip = Channel(
        youtube_channel_id="UC_snap_skip",
        channel_name="Skip",
        status="active",
        source="manual",
        schedule_hour=9,
    )
    db_session.add_all([ch_match, ch_skip])
    await db_session.commit()

    mock_yt = MagicMock()
    mock_yt.get_channel_info = AsyncMock(
        return_value={
            "channel_name": "Match",
            "subscriber_count": 100,
            "view_count": 500,
            "video_count": 10,
            "description": None,
            "thumbnail_url": None,
            "country": None,
            "custom_url": None,
        }
    )

    with patch(
        "youtube_monitor.collector.jobs.channel_snapshot.get_taipei_date",
        return_value=date(2026, 4, 3),
    ):
        result = await run_channel_snapshot_job(db_session, mock_yt, current_hour=4)

    assert result["channels_processed"] == 1
    mock_yt.get_channel_info.assert_called_once_with("UC_snap_match")


@pytest.mark.asyncio
async def test_channel_snapshot_updates_schedule_hour(db_session):
    """channel_snapshot 執行後，channel.schedule_hour 應依最新影片台北時間 +1 更新。"""
    channel = Channel(
        youtube_channel_id="UC_sched_update",
        channel_name="SchedUpdate",
        status="active",
        source="manual",
        schedule_hour=6,
    )
    db_session.add(channel)
    await db_session.commit()
    result = await db_session.execute(
        select(Channel).where(Channel.youtube_channel_id == "UC_sched_update")
    )
    channel = result.scalar_one()

    # 插入一支影片：UTC 12:00 = 台北 20:00，期望 schedule_hour = (20+1)%24 = 21
    video = Video(
        youtube_video_id="sched_vid_01",
        channel_id=channel.id,
        title="Sched Video",
        published_at=datetime(2026, 3, 20, 12, 0, tzinfo=timezone.utc),
        status="public",
        schedule_hour=6,
    )
    db_session.add(video)
    await db_session.commit()

    mock_yt = MagicMock()
    mock_yt.get_channel_info = AsyncMock(
        return_value={
            "channel_name": "SchedUpdate",
            "subscriber_count": 100,
            "view_count": 500,
            "video_count": 1,
            "description": None,
            "thumbnail_url": None,
            "country": None,
            "custom_url": None,
        }
    )

    with patch(
        "youtube_monitor.collector.jobs.channel_snapshot.get_taipei_date",
        return_value=date(2026, 3, 20),
    ):
        await run_channel_snapshot_job(db_session, mock_yt, current_hour=6)

    await db_session.refresh(channel)
    assert channel.schedule_hour == 21  # (12 UTC + 8 = 20 Taipei, +1 = 21)


@pytest.mark.asyncio
async def test_channel_snapshot_schedule_hour_wraps(db_session):
    """台北時間 23:xx 的影片，schedule_hour 應 wrap 成 0。"""
    channel = Channel(
        youtube_channel_id="UC_sched_wrap",
        channel_name="SchedWrap",
        status="active",
        source="manual",
        schedule_hour=6,
    )
    db_session.add(channel)
    await db_session.commit()
    result = await db_session.execute(
        select(Channel).where(Channel.youtube_channel_id == "UC_sched_wrap")
    )
    channel = result.scalar_one()

    # UTC 15:30 = 台北 23:30，(23+1)%24 = 0
    video = Video(
        youtube_video_id="sched_wrap_vid",
        channel_id=channel.id,
        title="Wrap Video",
        published_at=datetime(2026, 3, 20, 15, 30, tzinfo=timezone.utc),
        status="public",
        schedule_hour=6,
    )
    db_session.add(video)
    await db_session.commit()

    mock_yt = MagicMock()
    mock_yt.get_channel_info = AsyncMock(
        return_value={
            "channel_name": "SchedWrap",
            "subscriber_count": 50,
            "view_count": 200,
            "video_count": 1,
            "description": None,
            "thumbnail_url": None,
            "country": None,
            "custom_url": None,
        }
    )

    with patch(
        "youtube_monitor.collector.jobs.channel_snapshot.get_taipei_date",
        return_value=date(2026, 3, 20),
    ):
        await run_channel_snapshot_job(db_session, mock_yt, current_hour=6)

    await db_session.refresh(channel)
    assert channel.schedule_hour == 0  # (23+1) % 24


@pytest.mark.asyncio
async def test_channel_snapshot_records_payload(db_session):
    """channel_snapshot job records input_payload, output_payload, and video_ids=None in FetchLog."""
    channel = await _add_active_channel(db_session, "UC_payload_ch", "Payload Channel")

    channel_data = make_channel_data("UC_payload_ch", "Payload Channel")
    mock_yt = MagicMock()
    mock_yt.get_channel_info = AsyncMock(return_value=channel_data)

    with patch(
        "youtube_monitor.collector.jobs.channel_snapshot.get_taipei_date",
        return_value=date(2026, 4, 4),
    ):
        await run_channel_snapshot_job(db_session, mock_yt, current_hour=6)

    logs = (await db_session.execute(select(FetchLog))).scalars().all()
    assert len(logs) == 1
    log = logs[0]

    assert log.input_payload is not None
    input_data = json.loads(log.input_payload)
    assert input_data["channel_id"] == "UC_payload_ch"

    assert log.output_payload is not None
    output_data = json.loads(log.output_payload)
    assert output_data["channel_name"] == "Payload Channel"

    assert log.video_ids is None
