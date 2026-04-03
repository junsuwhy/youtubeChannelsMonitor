from unittest.mock import MagicMock
from apscheduler.triggers.cron import CronTrigger

from youtube_monitor.collector.scheduler import create_scheduler


def _get_job(scheduler, job_id):
    return next(j for j in scheduler.get_jobs() if j.id == job_id)


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


def test_discover_videos_runs_at_minute_10():
    scheduler = create_scheduler(MagicMock(), MagicMock())
    job = _get_job(scheduler, "discover_videos")
    trigger = job.trigger
    assert isinstance(trigger, CronTrigger)
    fields = {f.name: str(f) for f in trigger.fields}
    assert fields["minute"] == "10"
    assert fields["hour"] == "*"


def test_video_snapshot_runs_at_minute_30():
    scheduler = create_scheduler(MagicMock(), MagicMock())
    job = _get_job(scheduler, "video_snapshot")
    trigger = job.trigger
    assert isinstance(trigger, CronTrigger)
    fields = {f.name: str(f) for f in trigger.fields}
    assert fields["minute"] == "30"
    assert fields["hour"] == "*"


def test_channel_snapshot_runs_at_minute_50():
    scheduler = create_scheduler(MagicMock(), MagicMock())
    job = _get_job(scheduler, "channel_snapshot")
    trigger = job.trigger
    assert isinstance(trigger, CronTrigger)
    fields = {f.name: str(f) for f in trigger.fields}
    assert fields["minute"] == "50"
    assert fields["hour"] == "*"
