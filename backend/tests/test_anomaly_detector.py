import datetime
from types import SimpleNamespace

from youtube_monitor.services.anomaly_detector import AnomalyDetector


def _snapshot(day: int, subscribers: int, views: int):
    return SimpleNamespace(
        snapshot_date=datetime.date(2026, 1, day),
        subscriber_count=subscribers,
        view_count=views,
    )


def test_detect_channel_anomalies_stable_data_returns_empty_list():
    detector = AnomalyDetector(window_size=14, threshold=3.0)
    snapshots = [
        _snapshot(day=i, subscribers=1000 + i, views=5000 + i) for i in range(1, 21)
    ]

    result = detector.detect_channel_anomalies(channel_id=1, snapshots=snapshots)

    assert result == []


def test_detect_channel_anomalies_detects_spike_on_day_15():
    detector = AnomalyDetector(window_size=14, threshold=3.0)
    snapshots = [_snapshot(day=i, subscribers=1000, views=5000) for i in range(1, 15)]
    snapshots.append(_snapshot(day=15, subscribers=1000, views=10000))

    result = detector.detect_channel_anomalies(channel_id=2, snapshots=snapshots)

    assert len(result) == 1
    assert result[0]["event_type"] == "view_spike"
    assert result[0]["channel_id"] == 2
    assert result[0]["snapshot_date"] == datetime.date(2026, 1, 15)


def test_detect_channel_anomalies_insufficient_data_returns_empty_list():
    detector = AnomalyDetector(window_size=14, threshold=3.0)
    snapshots = [_snapshot(day=i, subscribers=1000, views=5000) for i in range(1, 14)]

    result = detector.detect_channel_anomalies(channel_id=3, snapshots=snapshots)

    assert result == []


def test_detect_channel_anomalies_constant_values_no_zero_division():
    detector = AnomalyDetector(window_size=14, threshold=3.0)
    snapshots = [_snapshot(day=i, subscribers=1000, views=5000) for i in range(1, 16)]

    result = detector.detect_channel_anomalies(channel_id=4, snapshots=snapshots)

    assert result == []


def test_detect_channel_anomalies_result_contains_required_keys():
    detector = AnomalyDetector(window_size=14, threshold=3.0)
    snapshots = [_snapshot(day=i, subscribers=1000, views=5000) for i in range(1, 15)]
    snapshots.append(_snapshot(day=15, subscribers=1000, views=10000))

    result = detector.detect_channel_anomalies(channel_id=5, snapshots=snapshots)

    required_keys = {
        "channel_id",
        "video_id",
        "event_type",
        "severity",
        "summary",
        "metric_name",
        "metric_value",
        "baseline_value",
        "deviation_score",
        "is_acknowledged",
        "snapshot_date",
    }
    assert len(result) == 1
    assert required_keys.issubset(set(result[0].keys()))
