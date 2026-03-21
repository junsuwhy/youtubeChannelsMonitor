# collector/

APScheduler-based data collection layer. Runs inside the FastAPI process. All jobs share the same `AsyncSessionLocal` from `database.py`.

## Scheduled Jobs (Asia/Taipei)
| Job function | Cron | Quota units | max_instances |
|---|---|---|---|
| `channel_snapshot` | 04:00 daily | ~N × 1 | 1 |
| `discover_videos` | 06:00 daily | ~N × ≤4 | 1 |
| `video_snapshot` | 08:00 daily | varies | 1 |
| WAL checkpoint | every hour | 0 | 1 |

`max_instances=1` on every job prevents SQLite lock contention from overlapping runs.

## YouTube API Rules (ABSOLUTE)
- **`search().list()` is FORBIDDEN** — 100 units/call. Use `playlistItems.list()` (1 unit/page).
- **`QuotaExceededException` = raise immediately**, no retry. The job exits; remaining channels are skipped.
- **Daily quota limit: 10,000 units.** Jobs are ordered (channel → discover → video) to stay within budget.
- Exponential backoff only for transient HTTP 5xx errors (via `googleapiclient.errors`).
- `FetchLog` row written for every job run (success or failure) with `api_units_used` count.

## Job Descriptions

### `jobs/channel_snapshot.py`
- Calls `channels.list(part="snippet,statistics")` for all active channels (batched by 50).
- Upserts `ChannelSnapshot` rows via `INSERT ... ON CONFLICT DO UPDATE`.
- Channels absent from API response → status set to `terminated`.

### `jobs/discover_videos.py`
- Iterates each channel's uploads playlist via `playlistItems.list()`.
- Hard cap: **4 pages per channel** (200 videos max).
- New videos inserted with `rapid_tracking_until = now + 7 days`.
- Existing videos: no update (metadata refresh is not this job's responsibility).

### `jobs/video_snapshot.py`
Three-tier sampling strategy:
| Tier | Condition | Frequency |
|---|---|---|
| A (rapid) | `rapid_tracking_until > now` | every run |
| B (recent) | published ≤ 30 days ago | every run |
| C (older) | published > 30 days ago | 1-in-N downsampled |

- Calls `videos.list(part="statistics")` batched by 50.
- Videos absent from API response → `privacy_status` set to `private`.
- Upserts `VideoSnapshot` rows.

## `youtube_client.py`
- Wraps `googleapiclient.discovery.build("youtube", "v3", ...)`.
- Raises `QuotaExceededException` on HTTP 403 with `reason == "quotaExceeded"`.
- Tracks cumulative `api_units_used` per job run (passed back to `FetchLog`).
- **Do not instantiate directly in tests** — mock `build` at module level.

## Background Fetch on Channel Creation
When a new channel is added via `POST /api/channels`, three jobs run immediately in sequence (separate async tasks, each with its own DB session):
1. `channel_snapshot` (single channel)
2. `discover_videos` (single channel)
3. `video_snapshot` (newly discovered videos)

## Upsert Pattern
All upserts use SQLite-specific syntax:
```python
insert(Model).values(...).on_conflict_do_update(index_elements=[...], set_={...})
```
**Not portable to PostgreSQL without modification.**
