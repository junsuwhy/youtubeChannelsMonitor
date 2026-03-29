/**
 * Domain TypeScript type interfaces matching backend Pydantic schemas
 * All types exported as named exports with no use of `any` type
 */

// ============================================================================
// Channel Types
// ============================================================================

export interface Channel {
  id: number;
  youtube_channel_id: string;
  channel_name: string | null;
  description: string | null;
  tags: string[] | null;
  topic_categories: string[] | null;
  country: string | null;
  custom_url: string | null;
  thumbnail_url: string | null;
  status: string;
  source: string;
  created_at: string | null;
  updated_at: string | null;
  subscriber_count: number | null;
  video_count: number | null;
  total_view_count: number | null;
  notes?: string | null;
}

export interface ChannelCreate {
  youtube_channel_id: string;
  channel_name?: string;
  tags?: string[];
  source?: string;
}

export interface ChannelUpdate {
  channel_name?: string | null;
  tags?: string[] | null;
  status?: string | null;
  description?: string | null;
  notes?: string | null;
}

export interface ChannelListResponse {
  items: Channel[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================================
// Video Types
// ============================================================================

export interface Video {
  id: number;
  youtube_video_id: string;
  channel_id: number;
  channel_name: string | null;
  title: string | null;
  description: string | null;
  published_at: string | null;
  duration: string | null;
  tags: string[] | null;
  topic_categories: string[] | null;
  status: string;
  created_at: string | null;
  updated_at?: string | null;
  thumbnail_url: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
}

export interface VideoListResponse {
  items: Video[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================================
// Snapshot Types (Time-series data)
// ============================================================================

export interface VideoSnapshot {
  id: number;
  video_id: number;
  snapshot_date: string;
  crawled_at: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
}

export interface ChannelSnapshot {
  id: number;
  channel_id: number;
  snapshot_date: string;
  subscriber_count: number | null;
  view_count: number | null;
  video_count: number | null;
}

export interface ChannelTrendPoint {
  date: string;
  subscriber_count: number | null;
  view_count: number | null;
}

// ============================================================================
// Stats Types
// ============================================================================

export interface StatsOverview {
  total_channels: number;
  total_videos: number;
  active_channels: number;
  new_videos_this_week: number;
}

export interface QuotaResponse {
  date: string;
  used_today: number;
  quota_limit: number;
  remaining: number;
  percentage_used: number;
}

// ============================================================================
// Fetch Log Types
// ============================================================================

export interface FetchLog {
  id: number;
  job_name: string;
  status: string;
  channels_processed: number;
  videos_processed: number;
  api_units_used: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  channel_id: number | null;
}

export interface FetchLogListResponse {
  items: FetchLog[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================================
// Auth Types
// ============================================================================

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface UserResponse {
  id: number;
  username: string;
  email: string | null;
  is_active: boolean;
}

// ============================================================================
// Anomaly Types (for Phase 2 features)
// ============================================================================

export interface AnomalyEvent {
  id: number;
  channel_id: number;
  video_id: number | null;
  event_type: string;
  severity: string;
  summary: string;
  metric_name: string | null;
  metric_value: number | null;
  baseline_value: number | null;
  deviation_score: number | null;
  is_acknowledged: boolean;
  detected_at: string;
  snapshot_date: string;
}

export interface AnomalyListResponse {
  items: AnomalyEvent[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================================
// Trending / Delta Types
// ============================================================================

export interface VideoTrendingItem {
  id: number;
  youtube_video_id: string;
  channel_id: number;
  title: string | null;
  channel_name: string | null;
  view_count: number | null;
  view_delta: number | null;
  thumbnail_url: string | null;
}

export interface TrendingVideosResponse {
  items: VideoTrendingItem[];
}

export interface ChannelTrendingItem {
  id: number;
  youtube_channel_id: string;
  channel_name: string | null;
  thumbnail_url: string | null;
  view_count: number | null;
  view_delta: number | null;
}

export interface TrendingChannelsResponse {
  items: ChannelTrendingItem[];
}

// ============================================================================
// System Types
// ============================================================================

export interface TriggerResponse {
  status: string;
  jobs: string[];
  quota_remaining: number;
}

// ============================================================================
// Utility types for API responses
// ============================================================================

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
