import axios from "axios";
import type {
  Channel, ChannelListResponse, ChannelSnapshot,
  Video, VideoListResponse, VideoSnapshot,
  AnomalyListResponse,
  FetchLogListResponse, StatsOverview, QuotaResponse,
  TrendingVideosResponse, TrendingChannelsResponse,
  DailyStatResponse,
} from "@/types/index";

const api = axios.create({ baseURL: "/api" });

// Request interceptor: auto-add Bearer token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor: 401 → redirect to /login
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export async function login(username: string, password: string) {
  const formData = new FormData();
  formData.append("username", username);
  formData.append("password", password);
  const res = await api.post("/auth/login", formData);
  return res.data; // { access_token, refresh_token, token_type }
}

export async function refreshToken(token: string) {
  const res = await api.post("/auth/refresh", {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function fetchChannels(params?: {
  status?: string;
  source?: string;
  tags?: string;
  search?: string;
  sort_by?: string;
  page?: number;
  limit?: number;
}): Promise<ChannelListResponse> {
  const res = await api.get("/channels", { params });
  return res.data;
}

export async function createChannel(data: { youtube_channel_id: string; channel_title?: string }) {
  const res = await api.post("/channels", data);
  return res.data;
}

export async function deleteChannel(id: number) {
  await api.delete(`/channels/${id}`);
}

export async function fetchSystemQuota(): Promise<QuotaResponse> {
  const res = await api.get("/system/quota");
  return res.data;
}

export async function fetchStatsOverview(): Promise<StatsOverview> {
  const res = await api.get("/stats/overview");
  return res.data;
}

export async function fetchVideos(params?: {
  channel_id?: number;
  title?: string;
  status?: string;
  include_non_public?: boolean;
  published_after?: string;
  published_before?: string;
  sort_by?: string;
  page?: number;
  limit?: number;
}): Promise<VideoListResponse> {
  const res = await api.get("/videos", { params });
  return res.data;
}

export async function fetchChannel(id: number): Promise<Channel> {
  const res = await api.get(`/channels/${id}`);
  return res.data;
}

export async function fetchChannelTrend(id: number) {
  const res = await api.get(`/stats/channels/${id}/trend`);
  return res.data;
}

export async function fetchNewVideos(limit?: number) {
  const res = await api.get("/stats/videos/new", { params: { limit } });
  return res.data;
}

export async function triggerFetch() {
  const res = await api.post("/system/fetch/trigger");
  return res.data;
}

export async function resolveChannelUrl(url: string): Promise<{ youtube_channel_id: string; channel_name: string | null; thumbnail_url: string | null }> {
  const res = await api.get("/channels/resolve", { params: { url } });
  return res.data;
}

export async function fetchChannelNow(id: number) {
  const res = await api.post(`/channels/${id}/fetch`);
  return res.data;
}

export async function fetchChannelSnapshots(channelId: number): Promise<ChannelSnapshot[]> {
  const res = await api.get(`/stats/channels/${channelId}/snapshots`);
  return res.data;
}

export async function fetchVideoSnapshots(videoId: number): Promise<VideoSnapshot[]> {
  const res = await api.get(`/videos/${videoId}/snapshots`);
  return res.data;
}

export async function fetchChannelAnomalies(
  channelId: number,
  params?: { event_type?: string; page?: number; limit?: number }
): Promise<AnomalyListResponse> {
  const res = await api.get(`/channels/${channelId}/anomalies`, { params });
  return res.data;
}

export async function fetchFetchLogs(params?: {
  job_type?: string;
  channel_id?: number;
  page?: number;
  limit?: number;
  status?: string;
}): Promise<FetchLogListResponse> {
  const res = await api.get("/system/logs", { params });
  return res.data;
}

export async function updateChannel(id: number, data: Partial<Pick<Channel, "status" | "tags" | "source" | "notes">>): Promise<Channel> {
  const res = await api.patch(`/channels/${id}`, data);
  return res.data;
}

export async function fetchChannelTags(): Promise<string[]> {
  const res = await api.get("/channels/tags");
  return res.data;
}

export async function fetchVideo(id: number): Promise<Video> {
  const res = await api.get(`/videos/${id}`);
  return res.data;
}

export async function fetchTrendingVideos(limit?: number): Promise<TrendingVideosResponse> {
  const res = await api.get("/stats/videos/trending", { params: { limit } });
  return res.data;
}

export async function fetchTrendingChannels(limit?: number): Promise<TrendingChannelsResponse> {
  const res = await api.get("/stats/channels/trending", { params: { limit } });
  return res.data;
}

// Misc
export async function fetchQuotaDaily(days: number = 30): Promise<DailyStatResponse> {
  const res = await api.get("/misc/quota/daily", { params: { days } });
  return res.data;
}

export async function fetchChannelsDailyAdditions(days: number = 30): Promise<DailyStatResponse> {
  const res = await api.get("/misc/channels/daily-additions", { params: { days } });
  return res.data;
}

export async function fetchVideosDailyNew(days: number = 30): Promise<DailyStatResponse> {
  const res = await api.get("/misc/videos/daily-new", { params: { days } });
  return res.data;
}

export default api;
