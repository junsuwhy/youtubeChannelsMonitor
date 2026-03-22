from unittest.mock import AsyncMock, MagicMock, patch
from datetime import date
from sqlalchemy import select

from youtube_monitor.models.channel import Channel
from youtube_monitor.models.channel_snapshot import ChannelSnapshot
from youtube_monitor.models.fetch_log import FetchLog
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
    """No active channels in DB → job completes, writes 1 fetch_log with channels_processed=0."""
    mock_client = MagicMock()

    result = await run_channel_snapshot_job(db_session, mock_client)

    logs = (await db_session.execute(select(FetchLog))).scalars().all()
    assert len(logs) == 1
    assert logs[0].channels_processed == 0
    assert logs[0].status == "success"
    assert logs[0].job_name == "channel_snapshot"
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

    result = await run_channel_snapshot_job(db_session, mock_client)

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

    # Verify fetch_log
    logs = (await db_session.execute(select(FetchLog))).scalars().all()
    assert len(logs) == 1
    assert logs[0].status == "success"
    assert logs[0].channels_processed == 2
    assert logs[0].api_units_used == 2
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
        await run_channel_snapshot_job(db_session, make_client())

    # Re-mock for second run
    with patch(
        "youtube_monitor.collector.jobs.channel_snapshot.get_taipei_date",
        return_value=today,
    ):
        await run_channel_snapshot_job(db_session, make_client())

    snapshots = (await db_session.execute(select(ChannelSnapshot))).scalars().all()
    assert len(snapshots) == 2, (
        f"Expected 2 snapshots after idempotent run, got {len(snapshots)}"
    )


async def test_snapshot_job_terminated_channel(db_session):
    """get_channel_info returns None → channel.status = 'terminated'."""
    channel = await _add_active_channel(db_session, "UC_gone_channel", "Gone Channel")

    mock_client = MagicMock()
    mock_client.get_channel_info = AsyncMock(return_value=None)

    await run_channel_snapshot_job(db_session, mock_client)

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

    result = await run_channel_snapshot_job(db_session, mock_client)

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
        await run_channel_snapshot_job(db_session, mock_client)

    snapshots = (await db_session.execute(select(ChannelSnapshot))).scalars().all()
    assert len(snapshots) == 1
    assert snapshots[0].snapshot_date == known_date
