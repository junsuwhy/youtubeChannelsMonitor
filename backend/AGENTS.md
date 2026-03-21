# backend/

## Stack
Python 3.12, FastAPI, SQLAlchemy async, APScheduler, Alembic, SQLite (aiosqlite).

## Module Layout
```
src/youtube_monitor/
  main.py          # FastAPI app + lifespan (migrations → scheduler start)
  config.py        # pydantic-settings (Settings singleton)
  database.py      # engine factory, AsyncSessionLocal, pragma event listener
  api/             # FastAPI routers (auth, channels, videos, stats, system)
  auth/            # JWT logic (security.py) + get_current_user dep (deps.py)
  collector/       # APScheduler setup + 3 collection jobs
  crud/            # DB read/write helpers (no business logic)
  models/          # SQLAlchemy ORM models
  schemas/         # Pydantic request/response schemas
  management/      # CLI tools (create_user)
backend/tests/     # pytest suite (asyncio_mode=auto)
backend/alembic/   # migration scripts
```

## Critical Rules
- **Single worker only.** `uvicorn ... --workers 1` — APScheduler is in-process.
- **`expire_on_commit=False`** on every `AsyncSession` — prevents `MissingGreenlet` on post-commit attribute access.
- **WAL mode** — `PRAGMA journal_mode=WAL` applied via SQLAlchemy `connect` event in `database.py`. Never disable.
- **NullPool** for file SQLite, **StaticPool** for in-memory (tests). Engine selection is in `database.py`.
- **No `search.list`** — enforced by a subprocess-grep test in `tests/test_youtube_client.py`.

## Run Commands
```bash
# Dev server (inside backend/)
pip install -e ".[dev]"
alembic upgrade head
uvicorn youtube_monitor.main:app --reload --port 8000

# Tests
pytest

# Lint / type check
ruff check .
mypy src/
```

## Test Conventions
- `asyncio_mode = "auto"` (pyproject.toml) — no `@pytest.mark.asyncio` decorator needed.
- In-memory SQLite + `StaticPool` in `conftest.py` — never touches `data/app.db`.
- `set_sqlite_pragmas` imported from `database.py` and applied in test fixtures too.
- Patch `youtube_monitor.collector.jobs.<job>.get_taipei_date` for date-dependent tests.
- Mock `youtube_monitor.collector.youtube_client.build` to avoid live API calls.

## Environment Variables
All loaded via `Settings` in `config.py` (pydantic-settings, `.env` file supported).
See root `AGENTS.md` for full variable table.

## Startup Sequence (main.py lifespan)
1. `alembic upgrade head` (sync subprocess call)
2. Create `AsyncEngine` + `AsyncSessionLocal`
3. Start APScheduler with all jobs registered
4. Yield (app serves requests)
5. Shutdown: APScheduler stopped

## Adding a New API Endpoint
1. Add router in `api/<domain>.py`
2. Register in `main.py` with `app.include_router(..., prefix="/api")`
3. Add Pydantic schemas in `schemas/<domain>.py`
4. Add CRUD helpers in `crud/<domain>.py`
5. Use `Depends(get_current_user)` on all protected routes
