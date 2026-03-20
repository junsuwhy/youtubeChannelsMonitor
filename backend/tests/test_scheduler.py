from unittest.mock import MagicMock

from youtube_monitor.collector.scheduler import create_scheduler


def test_scheduler_creates_jobs():
    """Verify all 4 jobs are registered."""
    mock_session_factory = MagicMock()
    mock_youtube_client = MagicMock()
    scheduler = create_scheduler(mock_session_factory, mock_youtube_client)
    job_ids = {job.id for job in scheduler.get_jobs()}
    assert "channel_snapshot" in job_ids
    assert "discover_videos" in job_ids
    assert "video_snapshot" in job_ids
    assert "wal_checkpoint" in job_ids
    assert len(job_ids) == 4


def test_scheduler_job_max_instances():
    """Verify all jobs have max_instances=1."""
    mock_session_factory = MagicMock()
    mock_youtube_client = MagicMock()
    scheduler = create_scheduler(mock_session_factory, mock_youtube_client)
    for job in scheduler.get_jobs():
        assert job.max_instances == 1, f"Job {job.id} has max_instances != 1"
