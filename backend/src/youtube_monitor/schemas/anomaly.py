from pydantic import BaseModel, ConfigDict
from datetime import datetime, date
from typing import Optional, List


class AnomalyEventResponse(BaseModel):
    id: int
    channel_id: int
    video_id: Optional[int] = None
    event_type: str
    severity: str
    summary: str
    metric_name: Optional[str] = None
    metric_value: Optional[float] = None
    baseline_value: Optional[float] = None
    deviation_score: Optional[float] = None
    is_acknowledged: bool
    detected_at: datetime
    snapshot_date: date

    model_config = ConfigDict(from_attributes=True)


class AnomalyListResponse(BaseModel):
    items: List[AnomalyEventResponse]
    total: int
    page: int
    limit: int
