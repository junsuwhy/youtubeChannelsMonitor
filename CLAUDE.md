# youtubeChannelsMonitor — Root AGENTS.md

## Project Purpose
Monitors Taiwanese YouTube content-farm channels for disinformation research. Collects channel stats, video metadata, and view counts on a daily schedule using the YouTube Data API v3.

## Monorepo Structure
```
backend/    Python 3.12 FastAPI + APScheduler + SQLite
frontend/   React 19 + TypeScript + Vite
```

## Critical Architecture Constraints

**`--workers 1` is MANDATORY.** APScheduler runs inside the FastAPI process. Multiple workers = duplicate scheduled jobs + SQLite write-lock contention. The backend Dockerfile already enforces this; never override it.

**No `search.list` API calls.** `search().list()` costs 100 quota units per call. Use `playlistItems.list()` (1 unit/page) for video discovery. This is enforced by code and by a test that greps the repo.

**SQLite WAL mode.** `PRAGMA journal_mode=WAL` is set on every connection via a SQLAlchemy event listener in `database.py`. Do not disable.

**`expire_on_commit=False` on all sessions.** Required for SQLAlchemy async to avoid `MissingGreenlet` errors when accessing attributes after commit.

**QuotaExceededException = abort, no retry.** On HTTP 403 / quotaExceeded, raise immediately. Do not retry the failed request.

## Running Locally

### Docker Compose (recommended)
```bash
cp .env.example .env          # set YOUTUBE_API_KEY and SECRET_KEY
docker compose up -d
# backend → http://localhost:8000  (API docs: /docs)
# frontend → http://localhost:3000
```

**重啟容器務必使用 `--no-cache` 重新 build，否則程式碼變更不會生效：**
```bash
docker compose build --no-cache backend frontend
docker compose up -d
```

### Backend dev server
```bash
cd backend
pip install -e ".[dev]"
alembic upgrade head
uvicorn youtube_monitor.main:app --reload --port 8000
```

### Frontend dev server
```bash
cd frontend
pnpm install
pnpm dev                       # Vite default: http://localhost:5173
```

### Create admin user
```bash
python -m youtube_monitor.management.create_user --username admin --password <pw>
```

## Environment Variables
| Variable | Default | Notes |
|---|---|---|
| `YOUTUBE_API_KEY` | — | **Required.** App raises `RuntimeError` on startup if missing |
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/app.db` | File lives at `data/app.db` |
| `SECRET_KEY` | `change-me-in-production` | **Change in production** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | |
| `ENVIRONMENT` | `development` | Set to `production` in prod |

## Build Commands
| Service | Command |
|---|---|
| Backend build | `docker build ./backend` |
| Frontend build | `tsc -b && vite build` (inside `frontend/`) |
| Backend tests | `pytest` (inside `backend/`) |
| Backend lint | `ruff check .` (inside `backend/`) |

## Database
- SQLite file: `data/app.db` (mapped to Docker volume `db-data`)
- Migrations: Alembic — run automatically on backend startup (`alembic upgrade head`)
- WAL checkpoint job runs hourly via APScheduler

## Scheduled Jobs (Taipei time)
| Job | Time | Quota cost |
|---|---|---|
| `discover_videos` | every hour at :10 | ~channels_in_slot × ≤4 pages × 1 unit |
| `video_snapshot` | every hour at :30 | ~videos_in_slot ÷ 50 units |
| `channel_snapshot` | every hour at :50 | ~channels_in_slot × 1 unit |
| WAL checkpoint | every hour at :00 | 0 |

Each channel and video is assigned a `schedule_hour` (0–23, Taipei). Jobs process only rows matching the current hour. `discover_videos` updates `schedule_hour` when new videos are found.

Daily quota limit: **10,000 units**.

## API Docs
Swagger UI: `http://localhost:8000/docs`
ReDoc: `http://localhost:8000/redoc`

## No CI Pipeline
No `.github/workflows/` exists. All dev flow is manual (`pytest`, `ruff`, `pnpm build`).
