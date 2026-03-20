from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any, List


class ChannelCreate(BaseModel):
    youtube_channel_id: str
    channel_name: Optional[str] = None
    tags: Optional[List[str]] = None
    source: str = "manual"


class ChannelUpdate(BaseModel):
    channel_name: Optional[str] = None
    tags: Optional[Any] = None
    status: Optional[str] = None
    description: Optional[str] = None


class ChannelResponse(BaseModel):
    id: int
    youtube_channel_id: str
    channel_name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[Any] = None
    topic_categories: Optional[Any] = None
    country: Optional[str] = None
    custom_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    status: str
    source: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    subscriber_count: Optional[int] = None
    video_count: Optional[int] = None
    total_view_count: Optional[int] = None

    model_config = {"from_attributes": True}


class ChannelListResponse(BaseModel):
    items: List[ChannelResponse]
    total: int
    page: int
    limit: int
