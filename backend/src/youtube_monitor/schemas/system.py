import json
from pydantic import BaseModel, field_validator
from datetime import datetime, date, timezone
from typing import Optional, List


class QuotaResponse(BaseModel):
    date: date
    used_today: int
    quota_limit: int
    remaining: int
    percentage_used: float


class FetchLogListItemResponse(BaseModel):
    id: int
    job_name: str
    channel_id: Optional[int] = None
    status: str
    channels_processed: int
    videos_processed: int
    api_units_used: int
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @field_validator("started_at", "finished_at", mode="after")
    @classmethod
    def ensure_utc(cls, v: Optional[datetime]) -> Optional[datetime]:
        if v is not None and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v


class FetchLogDetailResponse(FetchLogListItemResponse):
    input_payload: Optional[str] = None
    output_payload: Optional[str] = None
    video_ids: Optional[List[str]] = None

    @field_validator("video_ids", mode="before")
    @classmethod
    def parse_video_ids(cls, v) -> Optional[List[str]]:
        if v is None:
            return None
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            return json.loads(v)
        return v


class FetchLogListResponse(BaseModel):
    items: List[FetchLogListItemResponse]
    total: int
    page: int
    limit: int


class TriggerResponse(BaseModel):
    status: str
    jobs: List[str]
    quota_remaining: int
