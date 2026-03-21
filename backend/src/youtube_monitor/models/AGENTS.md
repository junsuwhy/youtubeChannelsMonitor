# models/

SQLAlchemy async ORM models. All inherit from `Base` in `base.py`.

## Tables
| Model | File | Notes |
|---|---|---|
| `Channel` | `channel.py` | Primary entity; soft-deletable via `status` field |
| `ChannelSnapshot` | `channel_snapshot.py` | Daily stats row per channel |
| `Video` | `video.py` | `rapid_tracking_until` drives Tier A sampling |
| `VideoSnapshot` | `video_snapshot.py` | Daily stats row per video |
| `FetchLog` | `fetch_log.py` | One row per job run; records `api_units_used` and outcome |
| `CofactsSource` | `cofacts_source.py` | External fact-check reference (read-only imports) |
| `User` | `user.py` | Admin users; `hashed_password` via passlib bcrypt |

## Critical Rules
- **`expire_on_commit=False`** — set on every `AsyncSession`. Without it, accessing model attributes after `await session.commit()` raises `MissingGreenlet`.
- **Soft delete only** — `Channel.status` field (`active` / `terminated` / `deleted`). No `CASCADE DELETE` on channel rows. Child rows (snapshots, videos) are retained for historical analysis.
- **JSON columns** — `Video.tags` and `Video.topic_categories` stored as JSON strings. Use `json.loads/dumps` in CRUD helpers, not in models.
- **Upserts** — all bulk writes use `INSERT ... ON CONFLICT DO UPDATE` (SQLite-specific). Do not use `session.merge()`.

## Channel.status Values
| Value | Meaning |
|---|---|
| `active` | Monitored normally |
| `terminated` | Channel absent from YouTube API (auto-set by `channel_snapshot` job) |
| `deleted` | Soft-deleted by admin via API |

## Adding a New Model
1. Create `models/<name>.py` inheriting `Base`
2. Import in `models/__init__.py` so Alembic autogenerate sees it
3. Run `alembic revision --autogenerate -m "<description>"`
4. Review generated migration — autogenerate misses index changes and JSON columns
5. Run `alembic upgrade head`
