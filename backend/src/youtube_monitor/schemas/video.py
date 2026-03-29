from pydantic import BaseModel, field_validator
from datetime import datetime, date, timezone
from typing import Optional, Any, List


class VideoResponse(BaseModel):
    id: int
    youtube_video_id: str
    channel_id: int
    channel_name: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    published_at: Optional[datetime] = None
    duration: Optional[str] = None
    tags: Optional[Any] = None
    topic_categories: Optional[Any] = None
    status: str
    created_at: Optional[datetime] = None
    thumbnail_url: Optional[str] = None
    view_count: Optional[int] = None
    like_count: Optional[int] = None
    comment_count: Optional[int] = None

    model_config = {"from_attributes": True}


class VideoListResponse(BaseModel):
    items: List[VideoResponse]
    total: int
    page: int
    limit: int


class VideoSnapshotResponse(BaseModel):
    id: int
    video_id: int
    snapshot_date: date
    crawled_at: Optional[datetime] = None
    view_count: Optional[int] = None
    like_count: Optional[int] = None
    comment_count: Optional[int] = None

    model_config = {"from_attributes": True}

    @field_validator("crawled_at", mode="after")
    @classmethod
    def ensure_utc(cls, v: Optional[datetime]) -> Optional[datetime]:
        if v is not None and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v


class ChannelSnapshotResponse(BaseModel):
    id: int
    channel_id: int
    snapshot_date: date
    subscriber_count: Optional[int] = None
    view_count: Optional[int] = None
    video_count: Optional[int] = None

    model_config = {"from_attributes": True}


class StatsOverviewResponse(BaseModel):
    total_channels: int
    total_videos: int
    active_channels: int
    new_videos_this_week: int


class ChannelTrendPoint(BaseModel):
    date: date
    subscriber_count: Optional[int] = None
    view_count: Optional[int] = None


class VideoTopItem(BaseModel):
    id: int
    youtube_video_id: str
    title: Optional[str] = None
    channel_id: int
    view_count: Optional[int] = None

    model_config = {"from_attributes": True}


class VideoTrendingItem(BaseModel):
    id: int
    youtube_video_id: str
    channel_id: int
    title: Optional[str] = None
    channel_name: Optional[str] = None
    view_count: Optional[int] = None
    view_delta: Optional[int] = None
    thumbnail_url: Optional[str] = None


class TrendingVideosResponse(BaseModel):
    items: List[VideoTrendingItem]


class ChannelTrendingItem(BaseModel):
    id: int
    youtube_channel_id: str
    channel_name: Optional[str] = None
    thumbnail_url: Optional[str] = None
    view_count: Optional[int] = None
    view_delta: Optional[int] = None


class TrendingChannelsResponse(BaseModel):
    items: List[ChannelTrendingItem]
