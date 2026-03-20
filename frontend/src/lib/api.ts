import axios from "axios";

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

export async function fetchChannels(params?: { status?: string; page?: number; limit?: number }) {
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

export async function fetchSystemQuota() {
  const res = await api.get("/system/quota");
  return res.data;
}

export async function fetchStatsOverview() {
  const res = await api.get("/stats/overview");
  return res.data;
}

export async function fetchVideos(params?: { channel_id?: number; page?: number; limit?: number }) {
  const res = await api.get("/videos", { params });
  return res.data;
}

export async function fetchChannel(id: number) {
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

export default api;
