# YouTube Channel Monitor

YouTube 頻道監控平台 — a platform to track YouTube content farm channels in Taiwan, monitoring their upload activity, subscriber growth, and engagement metrics to help identify disinformation patterns.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                   YouTube Channel Monitor                        │
├─────────────────┬────────────────────┬───────────────────────────┤
│   Collector     │     Backend        │      Dashboard            │
│  (APScheduler)  │   (FastAPI API)    │    (React + Vite)         │
│                 │                    │                           │
│ - channel_      │ - REST API         │ - Channel list            │
│   snapshot      │ - JWT Auth         │ - Channel detail          │
│ - discover_     │ - CRUD endpoints   │ - Video list              │
│   videos        │                    │ - Batch import            │
│ - video_        │                    │ - Stats dashboard         │
│   snapshot      │                    │                           │
└────────┬────────┴──────────┬─────────┴───────────────────────────┘
         │                   │
         ▼                   ▼
  YouTube Data API v3    SQLite (WAL)
                        ./data/app.db
```

## Quick Start

```bash
cp .env.example .env
# Edit .env — fill in YOUTUBE_API_KEY (get from Google Cloud Console)
docker compose up -d
# Open http://localhost:3000
```

## Initialize Admin Account

After first startup, run inside the backend container:

```bash
docker compose exec backend python -m youtube_monitor.management.create_user \
  --username admin --password <your-password>
```

Or in dev environment:

```bash
cd backend && python -m youtube_monitor.management.create_user \
  --username admin --password <your-password>
```

Note: The system does NOT auto-create a default account. You must run this command manually. Password must be at least 8 characters.

## Environment Variables

- `YOUTUBE_API_KEY`: YouTube Data API v3 key (required). Get from Google Cloud Console → Credentials.
- `DATABASE_URL`: SQLite path (default: `sqlite+aiosqlite:///./data/app.db`).
- `ENVIRONMENT`: `development` or `production`.
- `SECRET_KEY`: JWT signing secret (use a long random string in production).
- `ACCESS_TOKEN_EXPIRE_MINUTES`: Access token lifetime (default: 60).
- `REFRESH_TOKEN_EXPIRE_DAYS`: Refresh token lifetime (default: 7).

## Development Setup

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn youtube_monitor.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
pnpm install
pnpm dev
# Runs at http://localhost:5173
```

## Run Tests

### Backend tests (62 tests)
```bash
cd backend
.venv/bin/pytest tests/ -v
```

### Frontend build check
```bash
cd frontend
pnpm build
```

## API Documentation

FastAPI auto-generates interactive API docs at: http://localhost:8000/docs

## Architecture Decisions

1. **`--workers 1` (Single Uvicorn Worker)**: APScheduler runs inside the FastAPI process. With multiple workers, each worker would create its own scheduler, causing duplicate collector jobs and SQLite write conflicts. Always keep `workers=1`.
2. **SQLite WAL Mode**: Write-Ahead Logging allows concurrent reads while writing. The backend sets `PRAGMA journal_mode=WAL` on every connection. Don't disable this.
3. **NullPool**: SQLite file-based databases don't support connection pooling the way PostgreSQL does. Using `NullPool` prevents "database is locked" errors by ensuring each request opens and closes its own connection.
4. **`expire_on_commit=False`**: SQLAlchemy's async sessions would raise `MissingGreenlet` errors if object attributes are accessed after commit.
5. **`search.list` API Disabled**: The YouTube `search.list` endpoint costs 100 quota units per call. Instead, we use `playlistItems.list` (1 unit per page) to list a channel's uploads. Daily quota is 10,000 units.

## Phase 2 Roadmap

### Phase 2 — Enhanced Features
- Video snapshot history and trend charts
- Channel growth trend visualization (subscribers/views)
- Anomaly detection (disappearing videos, view count spikes)
- CSV export
- New video intensive tracking schedule

### Phase 3 — Cofacts Integration
- Cofacts API crawler: auto-discover YouTube URLs in fact-check reports
- Auto-add channels discovered via Cofacts
- Cofacts source cross-reference display
- `/api/external/discover` endpoint

### Phase 4 — Advanced Features
- Channel/video title change detection
- Video thumbnail AI analysis (detect sensational image patterns)
- Subtitle extraction and content analysis
- Multi API key rotation
- User role & permission management
- Public read-only Dashboard for community sharing
- Blocklist integration (uBlacklist community list import)
