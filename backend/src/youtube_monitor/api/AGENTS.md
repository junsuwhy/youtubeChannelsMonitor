# api/

FastAPI routers. All mounted under `/api` prefix in `main.py`.

## Routers
| File | Prefix | Auth required |
|---|---|---|
| `auth.py` | `/api/auth` | No (login/refresh are public) |
| `channels.py` | `/api/channels` | Yes (all routes) |
| `videos.py` | `/api/videos` | Yes |
| `stats.py` | `/api/stats` | Yes |
| `system.py` | `/api/system` | Yes |

## Auth Pattern
```python
current_user: User = Depends(get_current_user)  # from auth/deps.py
```
`get_current_user` decodes the JWT Bearer token and raises `401` if invalid/expired. Add it to every new protected endpoint.

## Endpoints Summary

### `auth.py`
- `POST /api/auth/login` — form data (`username`, `password`) → `{access_token, refresh_token}`
- `POST /api/auth/refresh` — body `{refresh_token}` → new `{access_token}`
- `GET /api/auth/me` → current user info

### `channels.py`
- `GET /api/channels` — paginated list, optional `?status=` filter
- `POST /api/channels` — create channel; triggers background fetch (3 jobs); returns `409` on duplicate `channel_id`
- `GET /api/channels/resolve?url=` — resolve a YouTube URL to channel_id (calls YouTube API)
- `GET /api/channels/{id}` — channel detail + latest snapshot stats (via `_channel_response` helper)
- `PATCH /api/channels/{id}` — update metadata fields
- `DELETE /api/channels/{id}` — **soft delete** (sets `status = "deleted"`); no CASCADE

### `videos.py`
- `GET /api/videos` — paginated, filterable by `channel_id`, `status`, date range

### `stats.py`
- `GET /api/stats/overview` — aggregate counts across all channels
- `GET /api/stats/channels/{id}/trend` — time-series snapshot data for a channel
- `GET /api/stats/videos/new` — recently discovered videos

### `system.py`
- `GET /api/system/quota` — today's quota usage from `FetchLog`
- `POST /api/system/fetch/trigger` — manually trigger collection jobs; returns `429` when quota exhausted

## Key Conventions
- `_channel_response(channel, session)` helper in `channels.py` merges ORM model with latest `ChannelSnapshot` stats into the response schema. Use this pattern for any endpoint that needs denormalized channel data.
- All DB operations use `async with AsyncSessionLocal() as session` — never reuse a session across requests.
- Validation errors → FastAPI default `422`. Business rule errors → explicit `HTTPException` with appropriate status codes.
- No background tasks spawned from `stats.py` or `videos.py` — read-only.
