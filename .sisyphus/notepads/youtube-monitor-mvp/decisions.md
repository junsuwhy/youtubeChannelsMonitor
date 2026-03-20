# Decisions — youtube-monitor-mvp

## [2026-03-20] Architecture Decisions

### Auth Strategy
- Multi-user JWT auth with `users` table
- Access token + Refresh token pattern
- Bearer middleware on ALL endpoints except `/api/auth/login` and `/health`
- CLI tool `create_user.py` for admin initialization (no auto-default user)

### Database Strategy
- SQLite (specified by user for portability)
- WAL mode for concurrent read/write
- NullPool (file) / StaticPool (tests)
- Integer PK (not UUID) for SQLite performance
- JSON columns (not PostgreSQL ARRAY/JSONB)

### Quota Strategy
- 429 response when remaining < 100 units (minimum safe threshold)
- No `search.list` usage (100 units/call)
- `playlistItems.list` for video discovery (1 unit/page)
- Max 200 videos per channel (4 pages × 50 items)

### Batch Import Strategy
- Frontend sequential calls to `POST /api/channels`
- No parallel calls (prevent race conditions)
- Real-time per-row status updates
- 409 = "already exists" (not failure)

### Collector Jobs Schedule (Asia/Taipei)
- 04:00 — channel_snapshot
- 06:00 — discover_videos
- 08:00 — video_snapshot
- Every hour — WAL checkpoint (PRAGMA wal_checkpoint TRUNCATE)
