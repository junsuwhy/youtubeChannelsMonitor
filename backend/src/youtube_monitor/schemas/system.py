from pydantic import BaseModel, field_validator
from datetime import datetime, date, timezone
from typing import Optional, List


class QuotaResponse(BaseModel):
    date: date
    used_today: int
    quota_limit: int
    remaining: int
    percentage_used: float


class FetchLogResponse(BaseModel):
    id: int
    job_name: str
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


class FetchLogListResponse(BaseModel):
    items: List[FetchLogResponse]
    total: int
    page: int
    limit: int


class TriggerResponse(BaseModel):
    status: str
    jobs: List[str]
    quota_remaining: int
