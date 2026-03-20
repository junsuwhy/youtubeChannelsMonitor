# Learnings — youtube-monitor-mvp

## [2026-03-20] Initialization

### Critical Technical Constraints
- **SQLite + async SQLAlchemy MUST use `NullPool`** (file-based) or `StaticPool` (in-memory tests)
- **`expire_on_commit=False` is MANDATORY** — default True causes `MissingGreenlet` with async sessions
- **APScheduler `max_instances=1` MANDATORY** — prevents job overlap with SQLite
- **`uvicorn --workers 1` MANDATORY** — multiple workers break APScheduler + SQLite
- **WAL mode** (`PRAGMA journal_mode=WAL`) required for concurrent reads
- **UTC+8 (Asia/Taipei)** for all snapshot dates — NOT `date.today()`
- **No `search.list` API** — use `playlistItems.list` instead (100 units vs 1 unit)

### Tech Stack
- Backend: Python 3.12, FastAPI 0.115+, SQLAlchemy 2.0 async, Alembic async, aiosqlite
- Auth: python-jose (JWT), passlib[bcrypt]
- Scheduler: APScheduler 3.x (AsyncIOScheduler)
- Frontend: React + Vite + TypeScript + shadcn/ui + TanStack Query v5 + Recharts
- DB: SQLite with WAL mode

### TanStack Query v5 Note
- `cacheTime` renamed to `gcTime` in v5 — NEVER use `cacheTime`

### Recharts Note
- For polled/real-time data: `isAnimationActive={false}` required

### Alembic Note
- Must use `alembic init -t async` (NOT plain `alembic init`)
- `env.py` MUST import ALL models before `target_metadata`

### JWT Auth Note
- Refresh tokens CANNOT be used for API access (check `type` field)
- Only `/api/auth/login` and `/health` are public endpoints
- ACCESS_TOKEN_EXPIRE_MINUTES and REFRESH_TOKEN_EXPIRE_DAYS from .env

### Video Snapshot Note
- Use upsert (INSERT OR REPLACE / ON CONFLICT DO UPDATE)
- Soft delete: set `status='inactive'` not hard delete
- Videos gone private/deleted: update `status` field only
## Task 1: Project Structure Initialization

### Completed: 2026-03-20

### Key patterns established:
- `backend/src/` layout with setuptools `find packages where=["src"]`
- `pyproject.toml` as the single source of truth for deps + tool config
- `asyncio_mode = "auto"` in pytest.ini_options (avoids manual `@pytest.mark.asyncio`)
- `NullPool` required for SQLite+async SQLAlchemy (file-based DB, not in-memory)
- `expire_on_commit=False` is set in `async_session_factory` — mandatory for async sessions
- Lifespan context manager pattern (not deprecated `app.on_event`)
- pnpm create vite frontend --template react-ts — scaffold only, no install yet

### LSP errors (expected, non-blocking):
- fastapi, pydantic_settings, sqlalchemy unresolved — packages not installed yet
- Will resolve after `pip install -e ".[dev]"` in Task 2/3

## [2026-03-20] Task 3: Docker Compose skeleton

### Patterns:
- docker-compose.yml uses env_file + environment override pattern
- backend/Dockerfile: MUST use --workers 1 (SQLite + APScheduler constraint)
- frontend/Dockerfile: multi-stage build (node builder → nginx:alpine)
- nginx.conf: proxy_pass to backend service name (not localhost)
- SPA routing requires try_files $uri $uri/ /index.html
- pnpm-lock.yaml may not exist yet during scaffold — use || pnpm install fallback

## [2026-03-20] Task 2: SQLAlchemy Models + Alembic

### Patterns:
- All models use SQLAlchemy 2.0 mapped_column() syntax
- Integer PKs (not UUID) for SQLite performance
- JSON columns for tags/topic_categories (not ARRAY)
- UniqueConstraint via __table_args__
- Alembic async template env.py pattern: create_async_engine in run_migrations_online
- Tests use StaticPool + in-memory SQLite

### Issues encountered:
- `setuptools.backends.legacy:build` not available in older setuptools — changed to `setuptools.build_meta`
- uv requires `--system` flag or venv; created `.venv` with `uv venv` then used `.venv/bin/python`/`.venv/bin/pytest`/`.venv/bin/alembic`
- LSP errors (sqlalchemy unresolved) are non-blocking — packages installed in venv, not system Python
- sqlite3 CLI not available — used Python + aiosqlite to query tables

### Evidence:
    - 7 tables created: channels, channel_snapshots, videos, video_snapshots, fetch_logs, cofacts_sources, users
- 4 pytest tests pass: unique_constraint, upsert, json_roundtrip, base_has_async_attrs

## [2026-03-20] Task 5: JWT Authentication

### Patterns:
- auth/security.py: decode_token() exported for reuse in both deps.py and api/auth.py
- CRITICAL: refresh tokens MUST have type="refresh" check in get_current_user — prevents using them for API access
- crud/user.py: authenticate_user returns None (not False) on failure — callers must check `if not user`
- api/auth.py: uses OAuth2PasswordRequestForm for /login (form data, not JSON)
- main.py: must include auth router before running tests
- dependency_overrides pattern for testing: override get_session with test engine session
- httpx.ASGITransport(app=app) for endpoint tests without starting real server
- management/create_user.py: uses AsyncSessionLocal directly (not get_session generator)
- **GOTCHA: passlib[bcrypt] incompatible with bcrypt 5.x** — passlib tries detect_wrap_bug() with >72 byte password which bcrypt 5.x rejects with ValueError. Fix: use `bcrypt` directly (`bcrypt.hashpw` / `bcrypt.checkpw`) instead of passlib CryptContext.

## [2026-03-20] Task 6: Channels CRUD API

## [2026-03-20] Task 7: Videos + Stats API

### Patterns:
- Videos are READ-ONLY from the API (no POST/PUT/DELETE — only Collector writes them)
- Stats overview queries: use func.count() with scalar() not scalars()
- ChannelTrendPoint: returns list of {date, subscriber_count, view_count}
- VideoSnapshot ordering: always snapshot_date ASC for trend charts
- get_top_videos joins Video with latest VideoSnapshot date for current stats
- api/stats.py is a SEPARATE file from api/videos.py
- Both use the same crud/video.py for DB operations

## [2026-03-20] Task 8: System API

### Patterns:
- QUOTA_MINIMUM_THRESHOLD = 100 units (minimum safe remaining before blocking trigger)
- QUOTA_LIMIT = 10000 (YouTube default daily quota)
- Used today: sum(api_units_used) from fetch_logs WHERE date(started_at) == today (Asia/Taipei)
- trigger endpoint: check quota FIRST, then trigger jobs, return 429 if remaining < 100
- Scheduler integration is a stub (ImportError) — Task 18 will wire it up
- zoneinfo.ZoneInfo("Asia/Taipei") for UTC+8 timezone-aware operations
- func.date() for SQLite date extraction from datetime columns
- Test isolation: use api_client_with_session fixture to share session between setup and request
- 11 tests pass covering: quota empty/with-logs/structure, logs empty/pagination/filter/validation, trigger happy-path/structure/quota-insufficient

## [2026-03-20] Task 4: SQLite async engine

### Patterns established:
- database.py: `set_sqlite_pragmas` function exported so conftest can reuse it
- WAL mode set via event.listen on sync_engine "connect"
- `_get_engine_kwargs()` helper: NullPool for file-based, StaticPool for :memory:
- config.py: Uses `model_config = {"env_file": ".env", "extra": "ignore"}` (Pydantic v2 style, NOT class Config)
- conftest.py: test_engine + db_session fixtures use StaticPool + create_all/drop_all
- Both test_models.py (which defines its own engine) and test_database.py work independently

### Gotcha: WAL mode + in-memory SQLite
- `:memory:` SQLite CANNOT use WAL — it always returns "memory" journal mode
- `PRAGMA journal_mode=WAL` is silently ignored for in-memory DBs
- WAL test MUST use a temp file-based DB (tempfile.NamedTemporaryFile + NullPool)
- foreign_keys and other pragmas DO work in-memory (confirm pragma function ran)

### Evidence:
- 7 passed (3 test_database.py + 4 test_models.py) — full suite green

## [2026-03-20] Task 13: React Frontend Scaffold

### Patterns:
- TanStack Query v5: MUST use gcTime (NOT cacheTime — removed in v5)
- AuthProvider uses localStorage for token persistence
- ProtectedRoute redirects to /login if not authenticated
- createBrowserRouter (not BrowserRouter) from react-router-dom v6
- All page components are stubs — T14-T20 will flesh them out
- shadcn/ui init with zinc theme, CSS variables
- EmptyState MUST have data-testid="empty-state"
- api.ts: login uses FormData (OAuth2PasswordRequestForm on backend)

## [2026-03-20] Task 9: YouTube API Client Wrapper

### Patterns:
- QuotaExceededException raised on 403 quotaExceeded — never retry
- All YouTube API calls wrapped in _run_in_executor (sync SDK in async app)
- _with_backoff uses int(e.resp.status) to get HTTP status from HttpError
- HttpError quota detection must check e.content (decoded bytes), NOT str(e) — str() doesn't include content body
- get_channel_info returns dict with uploads_playlist_id from contentDetails.relatedPlaylists.uploads
- get_uploads_playlist_items caps at max_pages=4 (200 videos max) — NEVER uses search.list
- get_video_details batches video IDs in groups of 50
- Tests mock _run_in_executor directly with AsyncMock (cleanest approach)
- asyncio_mode=auto means no @pytest.mark.asyncio decorator needed

## [2026-03-20] Task 14: Login Page

### Patterns:
- LoginPage uses useAuth().login() and navigates to "/" on success
- Error shown as "帳號或密碼錯誤" (no raw HTTP codes to user)
- Button shows "登入中..." during loading (disabled state)
- aria-label="username" and aria-label="password" on inputs (for Playwright)
- Already-authenticated redirect: if (isAuthenticated) navigate("/")
- shadcn/ui components imported with @/ alias → requires vite.config.ts resolve.alias
- Playwright e2e tests in frontend/e2e/ directory

## [2026-03-20] Task 10: Channel Snapshot Collector Job

### Patterns:
- Uses `sqlite_insert().on_conflict_do_update()` for upsert — idempotent runs
- get_taipei_date() helper in collector/utils.py — shared by T10, T12
- FetchLog written at end with job_name='channel_snapshot', status, channels_processed, api_units_used
- QuotaExceededException caught → fetch_log status='failed', stop processing
- Channels not returned by API → status='terminated'
- Tests mock YouTubeClient with MagicMock (not AsyncMock) then assign AsyncMock to async methods
- Empty channel list handled as an early-exit success path (no loop entered)
- `update()` construct used for in-place column updates (status, channel_name, updated_at)

## [2026-03-20] Task 11: Video Discovery Collector Job

### Patterns:
- **uploads_playlist_id caching**: Store on Channel after first API call to avoid repeated channels.list calls (1 unit each). Check `channel.uploads_playlist_id` first, only call API if None.
- **New video filtering**: Use `select(Video.youtube_video_id).where(Video.youtube_video_id.in_(video_ids))` to get existing IDs set, then diff against playlist results. Avoids calling `get_video_details` for known videos.
- **rapid_tracking_until**: Set to `get_taipei_date() + timedelta(days=7)` using Taipei date (UTC+8), not UTC.
- **sqlite_insert upsert for videos**: `on_conflict_do_update(index_elements=["youtube_video_id"])` — same pattern as channel_snapshot.
- **api_units_used accounting**: playlistItems.list = 1 unit per page (50 videos per page); videos.list = 1 unit per 50 videos; channels.list = 1 unit per call.
- **Alembic autogenerate**: Adding `Date` type column requires importing `Date` from sqlalchemy — migration correctly detected both new columns.
- **Test pattern**: Pre-insert existing videos using sqlite_insert inside test body; mock `get_uploads_playlist_items` returning those IDs → verify `get_video_details` not called.
- **Video ID length**: youtube_video_id is String(11) — test IDs must be exactly 11 chars or Alembic/SQLite will accept them anyway (SQLite doesn't enforce string length).

## [2026-03-20] Task 12: Video Snapshot Collector Job
### Patterns:
- 3-tier video selection: Tier A (rapid_tracking_until >= today), Tier B (recent 30d, no rapid tracking), Tier C (old, downsampled by ISO week)
- Downsampling uses `today.weekday()` to compute week_start, then checks VideoSnapshot existence for that video_id in the same week
- `sqlite_insert().on_conflict_do_update()` on `["video_id", "snapshot_date"]` handles idempotent upserts
- Videos missing from API batch response → `status='private'` (never hard-delete)
- `api_units_used = 1 per 50-video batch` (not ceil(n/50) in formula — just increment per batch loop iteration)
- Deduplication needed across tiers (a video with rapid_tracking_until could also be <30 days old and appear in Tier B)
- Test for downsampling: pre-insert a VideoSnapshot with `snapshot_date` in the same ISO week, verify `get_video_details` is never called
- `get_taipei_date` is patched at `youtube_monitor.collector.jobs.video_snapshot.get_taipei_date`
- `expired_on_commit=False` set in session factory — no need to refresh objects after commit

## [2026-03-20] Tasks 15/16/17: Frontend Pages
### Patterns:
- **TanStack Query arrays**: When API wraps lists in `{ items: [...] }`, check `Array.isArray(data) ? data : data?.items || []` for resilient mapping.
- **Recharts performance**: Always use `isAnimationActive={false}` in `Line` components to prevent layout thrashing and follow constraints.
- **Playwright mocking**: Use `page.route` to mock backend responses based on method (`GET`/`POST`) to test interaction flows without a real DB. 
- **Type safety**: Ensure `TickFormatter` and `Tooltip` formatter functions properly map `any`/`string` types back to `number` to satisfy Recharts and strict TypeScript constraints.

## [2026-03-20] Tasks 19/20: Video List + Channel Import Pages
### Patterns:
- Created standard `Textarea` UI component wrapping standard HTML textarea with forwardRef and consistent styling.
- `ChannelImportPage` uses sequential loop `for (let i = 0; i < initialRows.length; i++)` avoiding Promise.all to bypass backend rate-limiting or concurrency issues.
- Batch import relies on `createChannel` and dynamically updates per-row state via functional state updates `setRows(prev => prev.map(...))` ensuring React state correctly reflects individual operations.
- `VideoListPage` follows `ChannelListPage` patterns with `useQuery` via `fetchVideos`, handling `useSearchParams` to retrieve optional `channel_id` filter.
- Handled visual status indications for both unavailable videos (strikethrough + opacity) and row-level batch status indicators utilizing shadcn `Badge`.

## [2026-03-20] Task 18: APScheduler Integration

### Patterns:
- **Scheduler factory pattern**: `create_scheduler(session_factory, youtube_client)` returns a configured `AsyncIOScheduler` — never start it in the factory, let the caller control lifecycle.
- **Session wrappers for APScheduler jobs**: Collector jobs take `(session: AsyncSession, youtube_client)`. APScheduler passes kwargs at call time, so create thin wrapper coroutines that open a session: `async with session_factory() as session: await run_job(session, client)`.
- **`ZoneInfo` object (not string) for timezone**: `AsyncIOScheduler(timezone=ZoneInfo("Asia/Taipei"))` — passing a string `"Asia/Taipei"` directly may cause deprecation warnings or errors in newer APScheduler versions.
- **`max_instances=1` on all jobs**: Prevents overlapping SQLite writes; MANDATORY.
- **WAL checkpoint job**: Schedule hourly `PRAGMA wal_checkpoint(TRUNCATE)` to prevent unbounded WAL file growth; misfire_grace_time=300.
- **Lifespan pattern for FastAPI**: Use `@asynccontextmanager async def lifespan(app: FastAPI)` + `app = FastAPI(lifespan=lifespan)`. Never use deprecated `app.on_event()`.
- **Validate API key at startup**: Raise `RuntimeError` in lifespan if `settings.youtube_api_key` is falsy — fails fast before scheduler starts.
- **Alembic programmatic migrations**: `Config("alembic.ini")` + `loop.run_in_executor(None, lambda: command.upgrade(cfg, "head"))` — runs sync Alembic in thread pool to avoid blocking async loop.
- **Scheduler tests don't start the scheduler**: Just call `create_scheduler(mock, mock)` and inspect `scheduler.get_jobs()` — no `.start()` needed, prevents background thread creation in tests.
- **Test count after T18**: 62 total (60 pre-existing + 2 new scheduler tests).

## [2026-03-20] Task 21: Docker Compose Finalization

### Status: All checks PASSED — no file changes needed

### Environment Findings:
- **Port conflicts are common**: Other projects (PM-UI uvicorn, wedding nginx) may occupy port 8000. Kill/stop before `docker compose up`.
- `wedding_webserver` container had nginx binding 0.0.0.0:8000→80 — `docker stop wedding_webserver` freed the port.
- **docker-compose.yml `version` attribute warning**: The `version: "3.9"` key is deprecated in newer Docker Compose — just a warning, not an error.

### Confirmed Working Config:
- `DATABASE_URL=sqlite+aiosqlite:////app/data/app.db` (4 slashes = absolute path inside container) in environment override
- Volume `db-data:/app/data` correctly mounts named volume at `/app/data`
- `start_period: 40s` gives Alembic migrations time to complete before healthcheck begins
- `depends_on backend condition: service_healthy` ensures frontend only starts after backend is healthy
- `--workers 1` in uvicorn CMD — mandatory for SQLite + APScheduler
- `pip install --no-cache-dir .` (non-editable) works correctly in Docker

### Evidence:
- `.sisyphus/evidence/task-21-docker-up.txt`
- `.sisyphus/evidence/task-21-volume-persistence.txt`

## Task 22: Create README.md
- Created comprehensive README.md at project root.
- Included architecture diagram, setup instructions, and Phase 2 roadmap.
- Documented critical architecture decisions: `--workers 1`, SQLite WAL, NullPool, etc.
- Verified all required sections exist using grep.
