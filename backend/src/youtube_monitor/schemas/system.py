from pydantic import BaseModel
from datetime import datetime, date
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


class FetchLogListResponse(BaseModel):
    items: List[FetchLogResponse]
    total: int
    page: int
    limit: int


class TriggerResponse(BaseModel):
    status: str
    jobs: List[str]
    quota_remaining: int
