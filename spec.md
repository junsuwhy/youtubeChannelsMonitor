# YouTube 內容農場監控平台 — 產品規格書

> **版本：** v0.1 draft
> **日期：** 2026-03-20
> **作者：** YY

---

## 1. 專案背景與目標

### 1.1 問題描述

台灣社群平台上大量流傳來自 YouTube 內容農場頻道的影片，這些頻道以聳動標題、AI 合成語音及剪輯手法製造假訊息或誤導性內容（如「樂齡指南」類型頻道）。目前缺乏系統性工具持續追蹤這些頻道的產出行為與傳播數據。

### 1.2 專案目標

建立一個 **YouTube 頻道監控平台**，能夠：

1. 管理一份「待監控頻道清單」，支援手動新增與未來由 Cofacts API 自動發現。
2. 每日定時透過 YouTube Data API v3 抓取頻道影片的完整 metadata 與互動數據。
3. 透過 Dashboard 呈現頻道活動趨勢、影片數據變化、以及異常行為偵測。

### 1.3 使用者角色

| 角色 | 說明 |
|------|------|
| 管理員 (Admin) | 管理頻道清單、設定排程、查看所有數據 |
| 查核志工 (Viewer) | 瀏覽 Dashboard、匯出資料、標記可疑影片 |
| 自動化代理 (Bot) | 未來由 Cofacts 爬蟲自動提交新頻道的 API client |

---

## 2. 系統架構

採用 **三子系統架構**：Collector、Backend、Dashboard。

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Collector    │────▶│   Backend    │────▶│  Dashboard   │
│  (排程爬蟲)   │     │  (API + DB)  │     │  (前端介面)   │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │
       ▼                    ▼
 YouTube Data API     PostgreSQL / SQLite
```

### 2.1 Collector（資料收集器）

負責與 YouTube Data API v3 互動，定時抓取並寫入資料庫。

### 2.2 Backend（後端 API）

提供 RESTful API 給 Dashboard 與外部整合使用，負責資料查詢、頻道管理、使用者認證。

### 2.3 Dashboard（前端儀表板）

視覺化呈現頻道數據、影片趨勢、異常偵測結果。

---

## 3. 資料模型

### 3.1 channels — 監控頻道

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | UUID / PK | 系統內部 ID |
| youtube_channel_id | VARCHAR(24) | YouTube Channel ID (e.g. `UCxxxxxxx`) |
| channel_title | TEXT | 頻道名稱 |
| channel_description | TEXT | 頻道說明 |
| custom_url | VARCHAR(255) | 自訂網址 (e.g. `@channelname`) |
| thumbnail_url | TEXT | 頻道頭像 URL |
| country | VARCHAR(10) | 頻道所屬國家 |
| published_at | TIMESTAMP | 頻道建立時間 |
| subscriber_count | BIGINT | 訂閱數（最新快照） |
| video_count | INT | 影片數（最新快照） |
| view_count | BIGINT | 總觀看數（最新快照） |
| source | VARCHAR(50) | 來源：`manual` / `cofacts` / `blocklist` |
| source_ref | TEXT | 來源參考（如 Cofacts article ID） |
| status | VARCHAR(20) | `active` / `paused` / `terminated` / `private` |
| tags | TEXT[] | 自訂標籤（如 `健康謠言`, `政治`, `詐騙`） |
| notes | TEXT | 備註 |
| first_seen_at | TIMESTAMP | 系統首次收錄時間 |
| last_fetched_at | TIMESTAMP | 最後一次成功爬取時間 |
| created_at | TIMESTAMP | 資料建立時間 |
| updated_at | TIMESTAMP | 資料更新時間 |

### 3.2 channel_snapshots — 頻道每日快照

用於追蹤頻道層級的指標變化趨勢。

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | UUID / PK | |
| channel_id | FK → channels | |
| snapshot_date | DATE | 快照日期 |
| subscriber_count | BIGINT | 當日訂閱數 |
| video_count | INT | 當日影片總數 |
| view_count | BIGINT | 當日累計觀看數 |
| hidden_subscriber | BOOLEAN | 是否隱藏訂閱數 |
| created_at | TIMESTAMP | |

> **唯一約束：** `(channel_id, snapshot_date)`

### 3.3 videos — 影片資料

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | UUID / PK | |
| youtube_video_id | VARCHAR(11) | YouTube Video ID |
| channel_id | FK → channels | |
| title | TEXT | 影片標題 |
| description | TEXT | 影片說明（完整） |
| published_at | TIMESTAMP | 影片發布時間 |
| thumbnail_url | TEXT | 縮圖 URL（maxres 優先） |
| duration | INTERVAL / VARCHAR | 影片長度 (ISO 8601: `PT5M30S`) |
| dimension | VARCHAR(4) | `2d` / `3d` |
| definition | VARCHAR(4) | `hd` / `sd` |
| caption | BOOLEAN | 是否有字幕 |
| category_id | INT | YouTube 影片分類 ID |
| default_language | VARCHAR(10) | 預設語言 |
| default_audio_language | VARCHAR(10) | 預設音訊語言 |
| tags | TEXT[] | YouTube 影片標籤 |
| topic_categories | TEXT[] | YouTube topic 分類 URL |
| live_broadcast_content | VARCHAR(20) | `none` / `live` / `upcoming` |
| made_for_kids | BOOLEAN | 是否標記為兒童內容 |
| status | VARCHAR(20) | `public` / `unlisted` / `private` / `deleted` |
| first_seen_at | TIMESTAMP | 系統首次發現時間 |
| last_fetched_at | TIMESTAMP | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 3.4 video_snapshots — 影片每日快照

追蹤影片的互動數據隨時間變化。

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | UUID / PK | |
| video_id | FK → videos | |
| snapshot_date | DATE | 快照日期 |
| view_count | BIGINT | 觀看次數 |
| like_count | BIGINT | 按讚數 |
| dislike_count | BIGINT | 倒讚數（若 API 可取得） |
| comment_count | BIGINT | 留言數 |
| favorite_count | BIGINT | 收藏數 |
| created_at | TIMESTAMP | |

> **唯一約束：** `(video_id, snapshot_date)`

### 3.5 fetch_logs — 爬取紀錄

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | UUID / PK | |
| job_type | VARCHAR(30) | `channel_list` / `video_list` / `video_detail` / `stats_update` |
| channel_id | FK → channels | 可為 NULL（全域任務） |
| status | VARCHAR(20) | `success` / `partial` / `failed` |
| api_quota_used | INT | 本次消耗的 API 配額單位 |
| items_fetched | INT | 抓取到的項目數量 |
| error_message | TEXT | 錯誤訊息 |
| started_at | TIMESTAMP | |
| finished_at | TIMESTAMP | |

### 3.6 cofacts_sources — Cofacts 來源對照（未來擴充）

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | UUID / PK | |
| cofacts_article_id | VARCHAR(50) | Cofacts 文章 ID |
| cofacts_reply_id | VARCHAR(50) | Cofacts 回覆 ID（可 NULL） |
| youtube_video_id | VARCHAR(11) | 對應的影片 ID |
| youtube_channel_id | VARCHAR(24) | 對應的頻道 ID |
| first_reported_at | TIMESTAMP | Cofacts 首次回報時間 |
| discovered_at | TIMESTAMP | 系統發現時間 |

---

## 4. Collector 子系統設計

### 4.1 YouTube Data API 使用策略

**API 配額規劃：** 預設每日 10,000 單位。

| API 呼叫 | 每次配額消耗 | 用途 |
|----------|------------|------|
| `channels.list` | 1 unit | 取得頻道基本資訊與統計 |
| `playlistItems.list` | 1 unit | 透過 uploads playlist 取得影片清單 |
| `videos.list` | 1 unit | 取得影片詳細資訊與統計數據 |
| `search.list` | **100 units** | 搜尋（盡量避免使用） |

**核心策略：避免使用 `search.list`**，改用以下流程：

```
1. channels.list(id=CHANNEL_ID, part=snippet,statistics,contentDetails)
   → 取得 uploads playlist ID (contentDetails.relatedPlaylists.uploads)

2. playlistItems.list(playlistId=UPLOADS_PLAYLIST_ID, part=snippet, maxResults=50)
   → 取得影片 ID 清單（分頁取得所有影片）

3. videos.list(id=VIDEO_ID_1,VIDEO_ID_2,..., part=snippet,statistics,contentDetails,status,topicDetails)
   → 批次取得影片完整資訊（每次最多 50 個 ID）
```

### 4.2 每日配額預算估算

假設監控 **50 個頻道**，每頻道平均 **20 支近期影片**需更新：

| 步驟 | 計算 | 配額消耗 |
|------|------|---------|
| 頻道資訊更新 | 50 channels ÷ 50 (batch) = 1 call | 1 |
| 取得影片清單 | 50 channels × 1 page avg = 50 calls | 50 |
| 影片詳細資訊 | 50 × 20 videos ÷ 50 (batch) = 20 calls | 20 |
| **每日總計** | | **~71 units** |

> 50 個頻道每天只需約 71 單位，10,000 配額綽綽有餘。可支撐約 **數千個頻道**的監控。

### 4.3 爬取排程

| 任務 | 排程 | 說明 |
|------|------|------|
| 全頻道統計快照 | 每日 04:00 UTC+8 | 更新 `channel_snapshots` |
| 新影片發現 | 每日 06:00 UTC+8 | 掃描各頻道 uploads playlist，發現新影片 |
| 影片統計快照 | 每日 08:00 UTC+8 | 更新所有 active 影片的 `video_snapshots` |
| 新影片密集追蹤 | 發布後 7 天內，每 6 小時 | 新影片發布初期快速追蹤數據變化 |
| 頻道狀態檢查 | 每週一次 | 偵測頻道是否已被刪除/設為私人 |

### 4.4 抓取欄位對照（YouTube API → DB）

**`channels.list` part=snippet,statistics,contentDetails：**

```
snippet.title           → channel_title
snippet.description     → channel_description
snippet.customUrl       → custom_url
snippet.thumbnails.high → thumbnail_url
snippet.country         → country
snippet.publishedAt     → published_at
statistics.subscriberCount  → subscriber_count
statistics.videoCount       → video_count
statistics.viewCount        → view_count
statistics.hiddenSubscriberCount → channel_snapshots.hidden_subscriber
contentDetails.relatedPlaylists.uploads → (用於後續 playlistItems 呼叫)
```

**`videos.list` part=snippet,statistics,contentDetails,status,topicDetails：**

```
snippet.title               → title
snippet.description         → description
snippet.publishedAt         → published_at
snippet.thumbnails.maxres   → thumbnail_url
snippet.tags                → tags
snippet.categoryId          → category_id
snippet.defaultLanguage     → default_language
snippet.defaultAudioLanguage → default_audio_language
contentDetails.duration     → duration
contentDetails.dimension    → dimension
contentDetails.definition   → definition
contentDetails.caption      → caption
statistics.viewCount        → view_count
statistics.likeCount        → like_count
statistics.commentCount     → comment_count
statistics.favoriteCount    → favorite_count
status.privacyStatus        → status
status.madeForKids          → made_for_kids
status.uploadStatus         → (用於判斷影片狀態)
topicDetails.topicCategories → topic_categories
snippet.liveBroadcastContent → live_broadcast_content
```

### 4.5 異常處理

| 狀況 | 處理方式 |
|------|---------|
| 影片變為 private/deleted | 將 `videos.status` 更新為對應狀態，記錄消失時間 |
| 頻道被終止 | 將 `channels.status` 改為 `terminated`，停止後續爬取 |
| API 配額超限 | 中斷當日任務，記錄 `fetch_logs`，隔日從斷點續行 |
| API 回傳錯誤 | 指數退避重試（最多 3 次），失敗寫入 `fetch_logs` |
| 頻道隱藏訂閱數 | `channel_snapshots.hidden_subscriber = true`，`subscriber_count` 記為 NULL |

---

## 5. Backend API 設計

### 5.1 頻道管理

| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/channels` | 列出所有監控頻道（支援分頁、篩選、排序） |
| POST | `/api/channels` | 新增頻道（輸入 Channel ID 或 URL，自動解析） |
| GET | `/api/channels/:id` | 頻道詳情 |
| PATCH | `/api/channels/:id` | 更新頻道設定（tags, status, notes） |
| DELETE | `/api/channels/:id` | 移除頻道（soft delete） |
| POST | `/api/channels/batch` | 批次新增頻道 |
| POST | `/api/channels/import` | 匯入頻道清單（CSV / JSON） |

**新增頻道時支援的輸入格式：**

```
- https://www.youtube.com/channel/UCxxxxxxx
- https://www.youtube.com/@handle
- https://www.youtube.com/watch?v=xxxxx  （自動反查頻道）
- https://youtu.be/xxxxx                 （自動反查頻道）
- UCxxxxxxx                              （直接 Channel ID）
```

### 5.2 影片查詢

| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/videos` | 影片列表（支援按頻道、日期、互動量篩選與排序） |
| GET | `/api/videos/:id` | 影片詳情（含快照歷史） |
| GET | `/api/videos/:id/snapshots` | 影片歷史數據 |
| GET | `/api/channels/:id/videos` | 特定頻道的影片列表 |

### 5.3 統計與匯總

| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/stats/overview` | 全平台統計總覽 |
| GET | `/api/stats/channels/:id/trend` | 頻道趨勢數據（訂閱、觀看成長） |
| GET | `/api/stats/videos/top` | 熱門影片排行（依觀看/按讚/留言） |
| GET | `/api/stats/videos/new` | 最新發現的影片 |
| GET | `/api/stats/anomalies` | 異常偵測結果 |

### 5.4 系統管理

| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/system/quota` | 今日 API 配額使用狀況 |
| GET | `/api/system/logs` | 爬取紀錄 |
| POST | `/api/system/fetch/trigger` | 手動觸發立即爬取 |

### 5.5 外部整合 API（供 Cofacts 自動發現用）

| Method | Path | 說明 |
|--------|------|------|
| POST | `/api/external/discover` | 外部系統提交新發現的 YouTube 連結 |

**Request body：**

```json
{
  "youtube_url": "https://youtu.be/5oXA6NaF6Lc",
  "source": "cofacts",
  "source_ref": "qvc9abt6zxsd",
  "first_reported_at": "2025-01-02T00:00:00Z",
  "tags": ["敬老卡", "健康謠言"]
}
```

**處理邏輯：**

1. 解析 URL 取得 video ID
2. 呼叫 YouTube API 反查 channel ID
3. 若頻道不存在 → 自動建立頻道並開始監控
4. 若頻道已存在 → 更新 `cofacts_sources` 對照表
5. 回傳頻道與影片的系統 ID

---

## 6. Dashboard 設計

### 6.1 首頁 — 總覽儀表板

**頂部指標卡片：**

- 監控中頻道數 / 已終止頻道數
- 追蹤影片總數 / 本週新增影片數
- 今日 API 配額使用量 / 剩餘量
- 異常事件數（本週）

**區塊 A — 最新動態時間線：**

以時間軸呈現近期事件：新影片發布、頻道狀態變更、影片消失等。

**區塊 B — 本週新增影片列表：**

表格顯示：縮圖、標題、頻道名、發布時間、觀看數、按讚數、留言數。支援排序。

**區塊 C — 頻道活躍度排行：**

依本週新發布影片數排序，快速辨識高產量頻道。

### 6.2 頻道列表頁

**功能：**

- 搜尋（頻道名、Channel ID、標籤）
- 篩選（狀態：active / terminated / private；來源：manual / cofacts）
- 排序（訂閱數、影片數、最後更新時間、加入監控時間）
- 批次操作（暫停監控、加標籤、匯出）

**列表欄位：** 頭像、頻道名、訂閱數、影片數、狀態、來源、標籤、最後活動時間

### 6.3 頻道詳情頁

**頻道資訊卡：** 頭像、名稱、說明、建立時間、國家、YouTube 連結

**趨勢圖表：**

- 訂閱數成長曲線（折線圖，daily snapshots）
- 累計觀看數成長曲線
- 影片發布頻率（柱狀圖，每週/每月發布數量）

**影片列表：** 該頻道所有影片，依發布時間排序，每列顯示縮圖、標題、發布時間、當前觀看/按讚/留言數

**異常記錄：** 該頻道的異常事件（影片突然消失、數據異常飆升等）

### 6.4 影片詳情頁

**影片資訊卡：** 縮圖、標題、說明、YouTube 連結、發布時間、時長、分類

**互動數據趨勢圖：** 觀看數 / 按讚數 / 留言數隨天數的折線圖

**Cofacts 對照：** 若有 Cofacts 來源，顯示首次回報時間、Cofacts 連結

**狀態歷程：** 如影片曾從 public 變為 private，顯示時間線

### 6.5 異常偵測頁

**異常規則（可配置）：**

| 規則 | 說明 |
|------|------|
| 影片消失 | 原為 public 的影片變為 private/deleted |
| 觀看數異常飆升 | 單日觀看增量超過該頻道歷史 95 百分位 |
| 大量發片 | 單日發布影片超過 N 支（可設定閾值） |
| 頻道終止 | 頻道被 YouTube 終止 |
| 標題/說明變更 | 影片或頻道的標題/說明被修改 |

顯示方式：時間線 + 嚴重程度標籤 + 連結到對應頻道/影片

### 6.6 匯出功能

- 匯出所有頻道清單（CSV / JSON）
- 匯出指定頻道的影片數據（CSV）
- 匯出影片快照歷史（CSV）
- 匯出異常事件報告（CSV / PDF）

---

## 7. Cofacts 自動發現機制（未來擴充）

### 7.1 概念

定時從 Cofacts API 搜尋包含 YouTube 連結的可疑訊息，自動將對應頻道加入監控清單。

### 7.2 Cofacts 搜尋策略

```
搜尋「可疑訊息」中包含 youtube.com 或 youtu.be 的回報：
  → 解析出影片 URL
  → 反查頻道 ID
  → 若為新頻道 → 自動加入監控（source = cofacts）
  → 記錄 cofacts_sources 對照
```

### 7.3 Cofacts GraphQL API 參考

```graphql
{
  ListArticles(
    filter: {
      articleTypes: [TEXT]
      moreLikeThis: { like: "youtube.com" }
    }
    orderBy: [{ createdAt: DESC }]
    first: 20
  ) {
    edges {
      node {
        id
        text
        createdAt
      }
    }
  }
}
```

> **注意：** Cofacts 搜尋不支援精確字串比對（雙引號無效，會自動斷詞），需要在應用層自行過濾結果中包含 YouTube URL 的項目。

### 7.4 URL 解析與頻道反查

從 Cofacts 訊息文字中提取 YouTube URL 的正則：

```
https?://(www\.)?(youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)[\w-]{11}
```

取得 video ID 後透過 `videos.list` API 反查 `snippet.channelId`。

---

## 8. 技術選型建議

| 層級 | 推薦方案 | 備選 | 理由 |
|------|---------|------|------|
| 程式語言 | Python | Node.js (TypeScript) | 資料處理生態豐富、YouTube API client 成熟 |
| Web Framework | FastAPI | Django REST | 非同步支援好、自帶 OpenAPI 文件 |
| 資料庫 | PostgreSQL | SQLite（原型階段可用） | 支援 JSONB、Array 型別、時序查詢效能好 |
| ORM | SQLAlchemy 2.0 | Prisma (若用 TS) | 支援 async、migration 成熟 |
| 排程 | APScheduler / Celery Beat | n8n (已有環境) | 依團隊偏好；n8n 適合 low-code 快速搭建 |
| 前端框架 | React + Inertia.js | Next.js / Nuxt.js | 延續既有技術棧 |
| 圖表 | Recharts / Chart.js | Apache ECharts | React 整合度高 |
| UI 元件 | shadcn/ui + Tailwind CSS | Ant Design | 延續既有設計系統 |
| 部署 | Docker Compose | Kubernetes | 單機部署足夠，降低維運複雜度 |
| YouTube API Client | `google-api-python-client` | `youtube-dl` (補充用) | 官方維護、配額管理透明 |

> **備註：** 若希望快速出 MVP，也可考慮 Laravel + Inertia.js + React 延續現有技術棧，Collector 用 Python 獨立服務或 Laravel Command + Queue。

---

## 9. API 配額管理策略

### 9.1 配額監控

- 每次 API 呼叫記錄消耗的配額單位到 `fetch_logs`
- Dashboard 即時顯示今日配額使用量
- 設定警告閾值（如 80%），發 Telegram / LINE 通知

### 9.2 配額節省技巧

1. **避免 `search.list`：** 永遠使用 `playlistItems.list`（1 unit）替代 `search.list`（100 units）。
2. **批次查詢：** `videos.list` 和 `channels.list` 都支援 `id` 參數傳入最多 50 個 ID，一次查完。
3. **差異更新：** 只對有變動的影片更新快照（比對 `etag`）。
4. **智慧排程：** 非活躍頻道（近 30 天無新影片）降低檢查頻率為每週一次。
5. **快照降頻：** 發布超過 30 天的影片，統計快照頻率降為每週一次。

### 9.3 多 API Key 支援（可選）

若監控頻道數超過單一 key 的配額負荷，支援設定多組 API Key 輪替使用。

---

## 10. 非功能需求

### 10.1 效能

- Dashboard 頁面首次載入 < 2 秒
- API 單一查詢回應時間 < 500ms
- 每日爬取任務在 2 小時內完成

### 10.2 可靠性

- 爬取失敗自動重試（指數退避，最多 3 次）
- 任務中斷後可從斷點續行
- 所有爬取行為可追溯（`fetch_logs`）

### 10.3 安全性

- API Key 存放於環境變數，不進版控
- 外部整合 API（`/api/external/*`）需 Bearer Token 認證
- Dashboard 支援基本認證（帳號密碼或 OAuth）

### 10.4 可觀測性

- 爬取任務執行日誌
- API 配額使用追蹤
- 錯誤告警通知（Telegram / LINE / Email）

---

## 11. 開發階段規劃

### Phase 1 — MVP（2-3 週）

- [x] 資料庫 schema 建立
- [ ] 頻道手動新增 / 刪除 CRUD
- [ ] Collector：每日爬取頻道資訊 + 影片清單 + 影片統計
- [ ] 基礎 Dashboard：頻道列表、影片列表、簡易統計圖表
- [ ] API 配額監控

### Phase 2 — 完善功能（2-3 週）

- [ ] 影片快照歷史與趨勢圖
- [ ] 頻道趨勢圖（訂閱/觀看成長）
- [ ] 異常偵測（影片消失、觀看飆升）
- [ ] 匯出功能（CSV）
- [ ] 新影片密集追蹤排程

### Phase 3 — Cofacts 整合（2 週）

- [ ] Cofacts API 爬蟲：自動搜尋含 YouTube URL 的回報
- [ ] 頻道自動發現與加入
- [ ] Cofacts 來源對照顯示
- [ ] `/api/external/discover` 端點

### Phase 4 — 進階功能（持續迭代）

- [ ] 頻道/影片標題變更偵測
- [ ] 影片縮圖 AI 分析（辨識聳動圖片模式）
- [ ] 影片字幕抓取與內容分析
- [ ] 多 API Key 輪替
- [ ] 使用者角色權限管理
- [ ] 公開 Dashboard（唯讀）供社群共享
- [ ] Blocklist 整合（uBlacklist 社群名單匯入）

---

## 12. 附錄

### A. YouTube Video Category ID 對照表（台灣常見）

| ID | 類別 |
|----|------|
| 1 | Film & Animation |
| 2 | Autos & Vehicles |
| 10 | Music |
| 15 | Pets & Animals |
| 17 | Sports |
| 19 | Travel & Events |
| 20 | Gaming |
| 22 | People & Blogs |
| 24 | Entertainment |
| 25 | News & Politics |
| 26 | Howto & Style |
| 27 | Education |
| 28 | Science & Technology |
| 29 | Nonprofits & Activism |

### B. 參考連結

- [YouTube Data API v3 文件](https://developers.google.com/youtube/v3/docs)
- [API 配額說明](https://developers.google.com/youtube/v3/getting-started#quota)
- [Cofacts API（GraphQL）](https://cofacts.tw/api)
- [uBlacklist 社群規則集](https://ublacklist.github.io/rulesets)
- [HackMD 原始研究筆記](https://hackmd.io/@LWS9lwHlSHK5Qb8Aia1L2g/Byqrh9Xcbg)
