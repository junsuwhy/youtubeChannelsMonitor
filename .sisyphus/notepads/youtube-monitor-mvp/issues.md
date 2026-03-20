# Issues & Gotchas — youtube-monitor-mvp

## [2026-03-20] Known Issues/Gotchas

### SQLite Issues
- `database is locked` → Use NullPool (not default pool)
- `MissingGreenlet` → Set `expire_on_commit=False` on session maker
- WAL file growth → Schedule hourly `PRAGMA wal_checkpoint(TRUNCATE)`

### APScheduler Issues  
- Job duplication → `max_instances=1` on every job
- Job duplication → `--workers 1` for uvicorn (NEVER increase)
- Use `misfire_grace_time=3600` (1 hour grace for missed jobs)

### Alembic Issues
- Silently incomplete migrations → MUST import ALL models in `env.py`
- Must use `alembic init -t async` template

### Frontend Issues
- `cacheTime` is deprecated in TanStack Query v5 → use `gcTime`
- Recharts animation flicker on polled data → `isAnimationActive={false}`

### YouTube API Issues
- 403 quotaExceeded → DO NOT retry (immediate stop)
- 429/500/503 → retry with exponential backoff (max 3 retries)
- `search.list` is FORBIDDEN (100 units/call)
