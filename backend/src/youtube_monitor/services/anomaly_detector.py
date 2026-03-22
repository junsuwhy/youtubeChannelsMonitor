import math


class AnomalyDetector:
    def __init__(self, window_size: int = 14, threshold: float = 3.0):
        self.window_size = window_size
        self.threshold = threshold

    def _compute_stats(self, values: list[float]) -> tuple[float, float]:
        n = len(values)
        if n == 0:
            return 0.0, 0.0
        mean = math.fsum(values) / n
        variance = math.fsum((v - mean) ** 2 for v in values) / n
        std = math.sqrt(variance)
        return mean, std

    def detect_channel_anomalies(self, channel_id: int, snapshots: list) -> list[dict]:
        if len(snapshots) < self.window_size:
            return []

        results = []
        metrics = [
            ("subscriber_count", "subscriber_spike"),
            ("view_count", "view_spike"),
        ]

        for metric_name, event_type in metrics:
            for i in range(self.window_size, len(snapshots)):
                window = snapshots[i - self.window_size : i]
                window_values = [float(getattr(s, metric_name) or 0) for s in window]
                current_value = float(getattr(snapshots[i], metric_name) or 0)

                mean, std = self._compute_stats(window_values)
                std_floored = max(std, 1.0)
                z_score = (current_value - mean) / std_floored

                if abs(z_score) >= self.threshold:
                    severity = (
                        "high"
                        if abs(z_score) >= 5.0
                        else ("medium" if abs(z_score) >= 4.0 else "low")
                    )
                    direction = "飆升" if z_score > 0 else "驟降"
                    label_map = {
                        "subscriber_count": "訂閱數",
                        "view_count": "觀看數",
                    }
                    label = label_map.get(metric_name, metric_name)
                    summary = f"{label}異常{direction}：當日 {int(current_value):,}（基準 {int(mean):,}，z-score {z_score:.1f}）"

                    results.append(
                        {
                            "channel_id": channel_id,
                            "video_id": None,
                            "event_type": event_type,
                            "severity": severity,
                            "summary": summary,
                            "metric_name": metric_name,
                            "metric_value": current_value,
                            "baseline_value": mean,
                            "deviation_score": z_score,
                            "is_acknowledged": False,
                            "snapshot_date": snapshots[i].snapshot_date,
                        }
                    )

        return results

    def detect_video_anomalies(self, video_id: int, snapshots: list) -> list[dict]:
        if len(snapshots) < self.window_size:
            return []

        results = []
        metrics = [
            ("view_count", "view_spike"),
            ("like_count", "like_spike"),
        ]

        for metric_name, event_type in metrics:
            for i in range(self.window_size, len(snapshots)):
                window = snapshots[i - self.window_size : i]
                window_values = [float(getattr(s, metric_name) or 0) for s in window]
                current_value = float(getattr(snapshots[i], metric_name) or 0)

                mean, std = self._compute_stats(window_values)
                std_floored = max(std, 1.0)
                z_score = (current_value - mean) / std_floored

                if abs(z_score) >= self.threshold:
                    severity = (
                        "high"
                        if abs(z_score) >= 5.0
                        else ("medium" if abs(z_score) >= 4.0 else "low")
                    )
                    direction = "飆升" if z_score > 0 else "驟降"
                    label_map = {"view_count": "觀看數", "like_count": "按讚數"}
                    label = label_map.get(metric_name, metric_name)
                    summary = f"{label}異常{direction}：當日 {int(current_value):,}（基準 {int(mean):,}，z-score {z_score:.1f}）"

                    results.append(
                        {
                            "channel_id": None,
                            "video_id": video_id,
                            "event_type": event_type,
                            "severity": severity,
                            "summary": summary,
                            "metric_name": metric_name,
                            "metric_value": current_value,
                            "baseline_value": mean,
                            "deviation_score": z_score,
                            "is_acknowledged": False,
                            "snapshot_date": snapshots[i].snapshot_date,
                        }
                    )

        return results
