# Fetch Now Button — Per-Channel Immediate Data Sync

## TL;DR

> **Quick Summary**: Add a "立即同步" (Fetch Now) button on each active channel row in the Channels page that immediately triggers all three collector jobs for that single channel. Also auto-trigger the same fetch as a background task when a new channel is added, so data appears right away instead of waiting until the next scheduled run.
>
> **Deliverables**:
> - `POST /api/channels/{channel_id}/fetch` — new backend endpoint
> - `channel_id` optional filter param on all three `run_*` collector job functions
> - Auto-fetch via `BackgroundTasks` in `create_channel`
> - `fetchChannelNow(id)` helper in `frontend/src/lib/api.ts`
> - "立即同步" button per active channel row in `ChannelListPage.tsx`
> - Tests for the new endpoint
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: T1 (job filter params) → T2 (endpoint) → T4 (frontend button)

---

## Context

### Original Request
"我想在 channels 頁做一個按鈕，按了就 fetch 該 channel 的全部資料，在新增 channel 的時候也會觸發這個功能，才不會新增 channel 後要等一天才有資料"

### Key Research Findings
- The three collector job functions (`run_channel_snapshot_job`, `run_discover_videos_job`, `run_video_snapshot_job`) always process ALL active channels — no per-channel filtering exists yet.
- `youtube_client` is NOT on `app.state` — endpoints must instantiate `YouTubeClient(api_key=settings.youtube_api_key)` directly.
- `_get_used_today(db)` and quota constants live in `api/system.py` — we'll import them from there.
- `run_discover_videos_job` depends on `channel.uploads_playlist_id` which is populated by `run_channel_snapshot_job`. Jobs must run in order: snapshot → discover → video_snapshot.
- A brand-new channel has `uploads_playlist_id = NULL` until snapshot runs — discover job must guard this.
- `QUOTA_MINIMUM_THRESHOLD = 100` is a safe reservation for full-batch runs; a single-channel fetch needs much less, so the per-channel endpoint uses `remaining > 0` as its quota guard.
- `BackgroundTasks` is the right FastAPI primitive for fire-and-forget auto-fetch after channel creation.
- Test pattern: `httpx.AsyncClient(transport=httpx.ASGITransport(app=app))` + `app.dependency_overrides`.

### Metis Review — Gaps Addressed
- **Job ordering dependency**: Enforced — T1 runs snapshot before discover before video_snapshot.
- **`uploads_playlist_id` NULL guard**: Must be added in the single-channel path of `run_discover_videos_job`.
- **Quota threshold**: Per-channel uses `remaining > 0`, NOT the 100-unit full-batch threshold.
- **BackgroundTask silent failure**: Wrap in try/except with explicit `logger.error` — acceptable fire-and-forget.
- **Terminated status after bad channel ID**: The endpoint response includes the final channel status; frontend shows a warning if it becomes `terminated`.
- **Tier C downsampling for per-channel fetch**: Downsampling still applies — a forced "Fetch Now" respects it (no special override needed).
- **Button visibility**: Hidden (not disabled) for non-active channels.
- **Scope lock**: `_get_used_today` is imported from `system.py` as-is (not moved). Constants imported from `system.py` module level.

---

## Work Objectives

### Core Objective
Enable users to immediately pull fresh YouTube data for a single channel via a button click, and ensure data is available right after channel creation.

### Concrete Deliverables
- `backend/src/youtube_monitor/collector/jobs/channel_snapshot.py` — `channel_id: int | None = None` param added
- `backend/src/youtube_monitor/collector/jobs/discover_videos.py` — `channel_id: int | None = None` param added, NULL guard for `uploads_playlist_id`
- `backend/src/youtube_monitor/collector/jobs/video_snapshot.py` — `channel_id: int | None = None` param added
- `backend/src/youtube_monitor/api/channels.py` — `POST /channels/{channel_id}/fetch` endpoint + BackgroundTasks in `create_channel`
- `frontend/src/lib/api.ts` — `fetchChannelNow(id: number)` exported function
- `frontend/src/pages/ChannelListPage.tsx` — per-row "立即同步" button
- `backend/tests/test_channels_api.py` — 4+ new test cases for the fetch endpoint

### Definition of Done
- [ ] `POST /api/channels/{id}/fetch` returns 200 with `{"status": "ok", "channel_id": N, "channel_status": "...", "results": {...}}`
- [ ] `POST /api/channels/{id}/fetch` returns 404 for non-existent or non-active channel
- [ ] `POST /api/channels/{id}/fetch` returns 429 when `remaining == 0`
- [ ] Existing 62 backend tests still pass with no modifications
- [ ] Frontend builds (`pnpm build`) without errors
- [ ] "立即同步" button appears only for `active` channels in the table

### Must Have
- Jobs run in sequence: `channel_snapshot` → `discover_videos` → `video_snapshot` (ordering is required by data dependency)
- Per-channel fetch uses `remaining > 0` as quota guard (not the 100-unit threshold)
- `run_discover_videos_job` single-channel path guards `if not channel.uploads_playlist_id: skip`
- BackgroundTasks auto-fetch in `create_channel` wrapped in try/except with error logging
- Endpoint returns `channel_status` field so frontend can detect `terminated` state
- Button click stops row navigation propagation (`e.stopPropagation()`)

### Must NOT Have (Guardrails)
- Do NOT move `_get_used_today` to a shared module — import it directly from `system.py`
- Do NOT change `QUOTA_MINIMUM_THRESHOLD` in `system.py` or move it
- Do NOT show "Fetch Now" button for non-active channels (hide entirely, not disabled)
- Do NOT modify the behavior of the existing full-run code paths in the three job functions (no regressions)
- Do NOT touch `queryKey` logic, router, or any other file not listed in Deliverables
- Do NOT add `BackgroundTasks` to any endpoint other than `create_channel`
- No `as any`, no `@ts-ignore`, no `console.log` in production code

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (pytest + httpx, 62 passing tests)
- **Automated tests**: Tests-after (not TDD — implementation and tests in same task)
- **Framework**: pytest + httpx.AsyncClient

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent):
├── Task 1: Add channel_id filter to all three run_* job functions [unspecified-high]
└── Task 2: Add fetchChannelNow() to frontend/src/lib/api.ts [quick]

Wave 2 (After Wave 1):
├── Task 3: Add POST /channels/{id}/fetch endpoint + BackgroundTasks in create_channel + tests [unspecified-high]
└── Task 4: Add Fetch Now button to ChannelListPage.tsx [visual-engineering]

Critical Path: T1 → T3 → done
Parallel Speedup: ~50% faster than sequential
```

### Agent Dispatch Summary
- Wave 1: T1 → `unspecified-high`, T2 → `quick`
- Wave 2: T3 → `unspecified-high`, T4 → `visual-engineering`

---

## TODOs

- [x] 1. Add `channel_id` filter param to all three `run_*` collector job functions

  **What to do**:

  **`channel_snapshot.py`** — `run_channel_snapshot_job`:
  - Change signature to: `async def run_channel_snapshot_job(session: AsyncSession, youtube_client: YouTubeClient, channel_id: int | None = None) -> dict`
  - Change the active-channels query from:
    ```python
    result = await session.execute(select(Channel).where(Channel.status == "active"))
    ```
    to:
    ```python
    query = select(Channel).where(Channel.status == "active")
    if channel_id is not None:
        query = query.where(Channel.id == channel_id)
    result = await session.execute(query)
    ```
  - All other logic (the for-loop, FetchLog writing, etc.) remains UNCHANGED.
  - Update docstring to mention the `channel_id` parameter.

  **`discover_videos.py`** — `run_discover_videos_job`:
  - Change signature to: `async def run_discover_videos_job(session: AsyncSession, youtube_client: YouTubeClient, channel_id: int | None = None) -> dict`
  - Change the active-channels query the same way as above.
  - **CRITICAL**: In the single-channel path, add a NULL guard for `uploads_playlist_id`. After retrieving the channel in the loop, if `channel_id is not None` and `channel.uploads_playlist_id is None`, it means we're doing an immediate fetch right after creation — the channel snapshot hasn't run yet to populate this field. In this case, the discover job will naturally call `youtube_client.get_channel_info()` to retrieve and persist the playlist ID (this code path already exists in the job — lines ~52–79 in the original). So **no extra guard is needed** — the existing code already handles this correctly. Just ensure the single-channel path goes through the same code path.
  - All other logic remains UNCHANGED.
  - Update docstring.

  **`video_snapshot.py`** — `run_video_snapshot_job`:
  - Change signature to: `async def run_video_snapshot_job(session: AsyncSession, youtube_client: YouTubeClient, channel_id: int | None = None) -> dict`
  - After the three tier queries, add a `channel_id` filter. The tiers select `Video` objects. When `channel_id` is provided, add `.where(Video.channel_id == channel_id)` to all three tier SELECT statements:
    ```python
    # Tier A
    tier_a_query = select(Video).where(
        Video.rapid_tracking_until >= today,
        Video.status == "public",
    )
    if channel_id is not None:
        tier_a_query = tier_a_query.where(Video.channel_id == channel_id)
    tier_a_result = await session.execute(tier_a_query)

    # Tier B
    tier_b_query = select(Video).where(
        Video.published_at >= datetime(...),
        (Video.rapid_tracking_until == None) | (Video.rapid_tracking_until < today),
        Video.status == "public",
    )
    if channel_id is not None:
        tier_b_query = tier_b_query.where(Video.channel_id == channel_id)
    tier_b_result = await session.execute(tier_b_query)

    # Tier C
    tier_c_query = select(Video).where(
        Video.published_at < datetime(...),
        Video.status == "public",
    )
    if channel_id is not None:
        tier_c_query = tier_c_query.where(Video.channel_id == channel_id)
    tier_c_result = await session.execute(tier_c_query)
    ```
  - All other logic (batching, VideoSnapshot upsert, FetchLog) remains UNCHANGED.
  - Update docstring.

  **Must NOT do**:
  - Do NOT change any logic inside the for-loops or batch processing
  - Do NOT change the FetchLog writing logic
  - Do NOT change the scheduled job wrappers in `scheduler.py` (they call these functions without `channel_id`, which will keep working via the default `None`)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Precise surgical edits to three files; regression risk requires careful attention
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3 (the endpoint needs these updated signatures)
  - **Blocked By**: None

  **References**:
  - `backend/src/youtube_monitor/collector/jobs/channel_snapshot.py` — full file, modify `run_channel_snapshot_job` signature and query
  - `backend/src/youtube_monitor/collector/jobs/discover_videos.py` — full file, modify `run_discover_videos_job` signature and query
  - `backend/src/youtube_monitor/collector/jobs/video_snapshot.py` — full file, modify `run_video_snapshot_job` signature and all three tier queries
  - `backend/src/youtube_monitor/collector/scheduler.py` — READ ONLY to confirm the wrappers pass no `channel_id` (confirming default `None` is backward-compatible)

  **Acceptance Criteria**:
  - [ ] All three function signatures updated with `channel_id: int | None = None`
  - [ ] `run_channel_snapshot_job` with `channel_id=None` behaves identically to before (all active channels)
  - [ ] `run_channel_snapshot_job` with `channel_id=5` only processes channel 5
  - [ ] Same for `run_discover_videos_job` and `run_video_snapshot_job`
  - [ ] `cd backend && .venv/bin/pytest tests/test_collector_channel_snapshot.py tests/test_collector_discover_videos.py tests/test_collector_video_snapshot.py -v` → all existing tests PASS

  **QA Scenarios**:
  ```
  Scenario: Backward compatibility — existing full-run path unchanged
    Tool: Bash (.venv/bin/pytest)
    Steps:
      1. Run: cd backend && .venv/bin/pytest tests/test_collector_channel_snapshot.py tests/test_collector_discover_videos.py tests/test_collector_video_snapshot.py -v
      2. Assert: 0 failures, all existing tests green
    Expected Result: All existing collector tests pass
    Evidence: .sisyphus/evidence/task-1-collector-regression.txt

  Scenario: Single-channel filter works for channel_snapshot
    Tool: Bash (python -c inline test)
    Steps:
      1. In tests/test_collector_channel_snapshot.py, verify a test exists that calls run_channel_snapshot_job with channel_id=<id> and asserts only that channel is processed
      2. Run: cd backend && .venv/bin/pytest tests/test_collector_channel_snapshot.py -k "channel_id" -v
    Expected Result: New channel_id-filtered test passes
    Evidence: .sisyphus/evidence/task-1-channel-filter-test.txt
  ```

  **Commit**: YES
  - Message: `feat(collector): add optional channel_id filter to all three run_* job functions`
  - Files: `backend/src/youtube_monitor/collector/jobs/channel_snapshot.py`, `backend/src/youtube_monitor/collector/jobs/discover_videos.py`, `backend/src/youtube_monitor/collector/jobs/video_snapshot.py`
  - Pre-commit: `cd backend && .venv/bin/pytest tests/test_collector_channel_snapshot.py tests/test_collector_discover_videos.py tests/test_collector_video_snapshot.py -v`

---

- [x] 2. Add `fetchChannelNow(id)` to `frontend/src/lib/api.ts`

  **What to do**:
  - Open `frontend/src/lib/api.ts`
  - Add one exported function after the existing `triggerFetch` function (line 84–87):
    ```typescript
    export async function fetchChannelNow(id: number) {
      const res = await api.post(`/channels/${id}/fetch`);
      return res.data;
    }
    ```
  - That's it. No other changes to `api.ts`.

  **Must NOT do**:
  - Do NOT modify any existing functions
  - Do NOT add error handling in this helper (callers handle errors)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line addition to an existing file
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `frontend/src/lib/api.ts:84-87` — add after `triggerFetch`, same pattern

  **Acceptance Criteria**:
  - [ ] `fetchChannelNow` exported from `frontend/src/lib/api.ts`
  - [ ] TypeScript compiles: `cd frontend && pnpm build` → exit 0

  **QA Scenarios**:
  ```
  Scenario: TypeScript build passes with new function
    Tool: Bash
    Steps:
      1. Run: cd frontend && pnpm build 2>&1 | tail -20
      2. Assert: exit code 0, no TypeScript errors mentioning api.ts
    Expected Result: Build succeeds
    Evidence: .sisyphus/evidence/task-2-frontend-build.txt
  ```

  **Commit**: NO (group with T4)

---

- [x] 3. Add `POST /channels/{channel_id}/fetch` endpoint + BackgroundTasks auto-fetch in `create_channel` + tests

  **What to do**:

  **In `backend/src/youtube_monitor/api/channels.py`**:

  1. Add new imports at the top of the file:
     ```python
     from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks, Request
     from youtube_monitor.collector.jobs.channel_snapshot import run_channel_snapshot_job
     from youtube_monitor.collector.jobs.discover_videos import run_discover_videos_job
     from youtube_monitor.collector.jobs.video_snapshot import run_video_snapshot_job
     from youtube_monitor.collector.youtube_client import YouTubeClient
     from youtube_monitor.config import settings
     from youtube_monitor.api.system import _get_used_today, QUOTA_LIMIT
     ```

  2. Modify `create_channel` to accept `BackgroundTasks` and trigger auto-fetch:
     ```python
     @router.post(
         "/channels", response_model=ChannelResponse, status_code=status.HTTP_201_CREATED
     )
     async def create_channel(
         data: ChannelCreate,
         background_tasks: BackgroundTasks,
         db: AsyncSession = Depends(get_session),
         current_user: User = Depends(get_current_user),
     ):
         try:
             channel = await channel_crud.create_channel(db, data)
         except IntegrityError:
             raise HTTPException(
                 status_code=status.HTTP_409_CONFLICT,
                 detail=f"Channel with youtube_channel_id '{data.youtube_channel_id}' already exists",
             )
         # Auto-trigger immediate fetch in background (fire-and-forget)
         background_tasks.add_task(_run_channel_fetch_background, channel.id)
         return channel
     ```

  3. Add the background task helper function (before the route functions, after the imports):
     ```python
     async def _run_channel_fetch_background(channel_id: int) -> None:
         """Background task: run all three collector jobs for a single channel.
         
         Called automatically after channel creation. Fire-and-forget — errors are
         logged but do not affect the HTTP response.
         """
         import logging
         logger = logging.getLogger(__name__)
         try:
             from youtube_monitor.database import AsyncSessionLocal
             youtube_client = YouTubeClient(api_key=settings.youtube_api_key)
             async with AsyncSessionLocal() as session:
                 await run_channel_snapshot_job(session, youtube_client, channel_id=channel_id)
             async with AsyncSessionLocal() as session:
                 await run_discover_videos_job(session, youtube_client, channel_id=channel_id)
             async with AsyncSessionLocal() as session:
                 await run_video_snapshot_job(session, youtube_client, channel_id=channel_id)
             logger.info("Background fetch completed for channel %d", channel_id)
         except Exception as e:
             logger.error("Background fetch failed for channel %d: %s", channel_id, e)
     ```
     Note: Each job gets its own session (following the existing scheduler wrapper pattern). This avoids session expiry issues between jobs.

  4. Add the new `POST /channels/{channel_id}/fetch` endpoint at the END of the file (before the last line):
     ```python
     @router.post("/channels/{channel_id}/fetch")
     async def fetch_channel_now(
         channel_id: int,
         db: AsyncSession = Depends(get_session),
         current_user: User = Depends(get_current_user),
     ):
         """Immediately run all three collector jobs for a single channel.
         
         Returns 404 if the channel doesn't exist or is not active.
         Returns 429 if the YouTube API quota is fully exhausted (remaining == 0).
         """
         # 1. Check channel exists and is active
         channel = await channel_crud.get_channel(db, channel_id)
         if not channel or channel.status != "active":
             raise HTTPException(
                 status_code=status.HTTP_404_NOT_FOUND,
                 detail="Channel not found or not active",
             )
         
         # 2. Quota check — per-channel fetch uses remaining > 0 (not the 100-unit threshold)
         used_today = await _get_used_today(db)
         remaining = max(0, QUOTA_LIMIT - used_today)
         if remaining == 0:
             raise HTTPException(
                 status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                 detail=f"Quota exhausted. Used today: {used_today}, limit: {QUOTA_LIMIT}",
             )
         
         # 3. Run all three jobs in sequence (ordering matters: snapshot → discover → video_snapshot)
         youtube_client = YouTubeClient(api_key=settings.youtube_api_key)
         results = {}
         
         # Each job gets its own session (mirrors scheduler wrapper pattern)
         from youtube_monitor.database import AsyncSessionLocal
         
         async with AsyncSessionLocal() as session:
             results["channel_snapshot"] = await run_channel_snapshot_job(
                 session, youtube_client, channel_id=channel_id
             )
         async with AsyncSessionLocal() as session:
             results["discover_videos"] = await run_discover_videos_job(
                 session, youtube_client, channel_id=channel_id
             )
         async with AsyncSessionLocal() as session:
             results["video_snapshot"] = await run_video_snapshot_job(
                 session, youtube_client, channel_id=channel_id
             )
         
         # 4. Re-fetch channel to get updated status (may have become 'terminated' if invalid)
         refreshed = await channel_crud.get_channel(db, channel_id)
         channel_status = refreshed.status if refreshed else "unknown"
         
         return {
             "status": "ok",
             "channel_id": channel_id,
             "channel_status": channel_status,
             "results": results,
         }
     ```

  **In `backend/tests/test_channels_api.py`**:

  Add the following tests (append to existing file):

  ```python
  # ── Fetch Now endpoint tests ──────────────────────────────────────────────────

  async def test_fetch_channel_now_not_found(api_client):
      """POST /channels/99999/fetch → 404 for non-existent channel."""
      response = await api_client.post("/api/channels/99999/fetch")
      assert response.status_code == 404

  async def test_fetch_channel_now_inactive_404(api_client):
      """POST /channels/{id}/fetch → 404 for inactive channel."""
      create_resp = await api_client.post(
          "/api/channels", json={"youtube_channel_id": "UCinactive_fetch"}
      )
      channel_id = create_resp.json()["id"]
      await api_client.delete(f"/api/channels/{channel_id}")  # soft-delete → inactive

      response = await api_client.post(f"/api/channels/{channel_id}/fetch")
      assert response.status_code == 404

  async def test_fetch_channel_now_quota_exhausted_429(api_client, test_engine):
      """POST /channels/{id}/fetch → 429 when remaining quota == 0."""
      from sqlalchemy.ext.asyncio import async_sessionmaker
      from youtube_monitor.models.fetch_log import FetchLog
      from datetime import datetime, timezone

      # Create channel
      create_resp = await api_client.post(
          "/api/channels", json={"youtube_channel_id": "UCquota_test"}
      )
      channel_id = create_resp.json()["id"]

      # Exhaust quota by inserting a FetchLog that uses all 10000 units
      async_session = async_sessionmaker(test_engine, expire_on_commit=False)
      async with async_session() as session:
          log = FetchLog(
              job_name="manual",
              status="success",
              channels_processed=0,
              videos_processed=0,
              api_units_used=10000,
              error_message=None,
              started_at=datetime.now(timezone.utc),
              finished_at=datetime.now(timezone.utc),
          )
          session.add(log)
          await session.commit()

      response = await api_client.post(f"/api/channels/{channel_id}/fetch")
      assert response.status_code == 429

  async def test_fetch_channel_now_success(api_client, test_engine):
      """POST /channels/{id}/fetch → 200 with correct response shape (mocked jobs)."""
      from unittest.mock import AsyncMock, patch

      create_resp = await api_client.post(
          "/api/channels", json={"youtube_channel_id": "UCsuccess_fetch"}
      )
      channel_id = create_resp.json()["id"]

      # Mock all three job functions so no real YouTube API call is made
      mock_result = {"status": "success", "channels_processed": 1, "api_units_used": 1}
      with (
          patch("youtube_monitor.api.channels.run_channel_snapshot_job", new_callable=AsyncMock, return_value=mock_result) as mock_snap,
          patch("youtube_monitor.api.channels.run_discover_videos_job", new_callable=AsyncMock, return_value={"status": "success", "videos_processed": 0, "api_units_used": 1}) as mock_disc,
          patch("youtube_monitor.api.channels.run_video_snapshot_job", new_callable=AsyncMock, return_value={"status": "success", "videos_processed": 0, "api_units_used": 1}) as mock_vid,
          patch("youtube_monitor.api.channels.YouTubeClient"),
      ):
          response = await api_client.post(f"/api/channels/{channel_id}/fetch")

      assert response.status_code == 200
      data = response.json()
      assert data["status"] == "ok"
      assert data["channel_id"] == channel_id
      assert "channel_status" in data
      assert "results" in data
      assert "channel_snapshot" in data["results"]
      assert "discover_videos" in data["results"]
      assert "video_snapshot" in data["results"]
      # Verify jobs were called with correct channel_id
      mock_snap.assert_called_once()
      call_kwargs = mock_snap.call_args
      assert call_kwargs.kwargs.get("channel_id") == channel_id or call_kwargs.args[-1] == channel_id
  ```

  **Must NOT do**:
  - Do NOT move `_get_used_today` or quota constants — import them from `system.py`
  - Do NOT use a shared session across all three jobs — each gets its own `AsyncSessionLocal()` context
  - Do NOT add `BackgroundTasks` to any other endpoint
  - Do NOT change the existing `create_channel` 409 error handling

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-part change requiring careful imports, session management, and test mocking
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 1 (needs updated job signatures)
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: F1, F2, F3
  - **Blocked By**: Task 1

  **References**:
  - `backend/src/youtube_monitor/api/channels.py` — full file (modify `create_channel`, add endpoint)
  - `backend/src/youtube_monitor/api/system.py:30-42` — `_get_used_today` function and `QUOTA_LIMIT`, `QUOTA_MINIMUM_THRESHOLD` constants
  - `backend/src/youtube_monitor/database.py` — find `AsyncSessionLocal` import path
  - `backend/src/youtube_monitor/config.py` — find `settings` import path
  - `backend/src/youtube_monitor/collector/youtube_client.py` — confirm `YouTubeClient(api_key=...)` constructor
  - `backend/src/youtube_monitor/collector/scheduler.py:~18-30` — read the `_*_wrapper` functions to confirm each gets its own `async with session_factory()` session (pattern to mirror)
  - `backend/tests/test_channels_api.py` — existing tests as pattern reference
  - `backend/tests/conftest.py` — `test_engine` and `api_client` fixture signatures

  **Acceptance Criteria**:
  - [ ] `POST /api/channels/99999/fetch` → 404
  - [ ] `POST /api/channels/{inactive_id}/fetch` → 404
  - [ ] `POST /api/channels/{id}/fetch` with exhausted quota → 429
  - [ ] `POST /api/channels/{id}/fetch` with mocked jobs → 200 with `{"status": "ok", "channel_id": N, "channel_status": "active", "results": {...}}`
  - [ ] `_run_channel_fetch_background` is registered via `background_tasks.add_task` in `create_channel`
  - [ ] `cd backend && .venv/bin/pytest tests/test_channels_api.py -v` → all tests pass (original + new)

  **QA Scenarios**:
  ```
  Scenario: 404 for non-existent channel
    Tool: Bash (pytest)
    Steps:
      1. Run: cd backend && .venv/bin/pytest tests/test_channels_api.py::test_fetch_channel_now_not_found -v
    Expected Result: PASSED
    Evidence: .sisyphus/evidence/task-3-404-test.txt

  Scenario: 429 when quota exhausted
    Tool: Bash (pytest)
    Steps:
      1. Run: cd backend && .venv/bin/pytest tests/test_channels_api.py::test_fetch_channel_now_quota_exhausted_429 -v
    Expected Result: PASSED
    Evidence: .sisyphus/evidence/task-3-429-test.txt

  Scenario: 200 success with correct response shape
    Tool: Bash (pytest)
    Steps:
      1. Run: cd backend && .venv/bin/pytest tests/test_channels_api.py::test_fetch_channel_now_success -v
    Expected Result: PASSED — all assertions pass including channel_id, channel_status, results keys
    Evidence: .sisyphus/evidence/task-3-200-test.txt

  Scenario: Full channels test suite passes
    Tool: Bash (pytest)
    Steps:
      1. Run: cd backend && .venv/bin/pytest tests/test_channels_api.py -v 2>&1
    Expected Result: All tests pass (original 7 + new 4 = 11+ total)
    Evidence: .sisyphus/evidence/task-3-full-channels-suite.txt
  ```

  **Commit**: YES
  - Message: `feat(channels): add POST /channels/{id}/fetch endpoint and auto-fetch on create`
  - Files: `backend/src/youtube_monitor/api/channels.py`, `backend/tests/test_channels_api.py`
  - Pre-commit: `cd backend && .venv/bin/pytest tests/test_channels_api.py -v`

---

- [x] 4. Add "立即同步" Fetch Now button to `ChannelListPage.tsx`

  **What to do**:

  1. Add `fetchChannelNow` to imports at top of file:
     ```typescript
     import { fetchChannels, createChannel, fetchChannelNow } from "@/lib/api";
     ```

  2. Add per-channel loading state (tracks which channel IDs are currently fetching):
     ```typescript
     const [fetchingChannels, setFetchingChannels] = useState<Set<number>>(new Set());
     ```

  3. Add the handler function (before the `return` statement):
     ```typescript
     const handleFetchNow = async (e: React.MouseEvent, channelId: number) => {
       e.stopPropagation(); // prevent row navigation
       setFetchingChannels(prev => new Set(prev).add(channelId));
       try {
         await fetchChannelNow(channelId);
         queryClient.invalidateQueries({ queryKey: ['channels'] });
       } catch (err: any) {
         // Silently log — could show a toast here if toast library is available
         console.error("Fetch now failed for channel", channelId, err?.response?.data?.detail || err.message);
       } finally {
         setFetchingChannels(prev => {
           const next = new Set(prev);
           next.delete(channelId);
           return next;
         });
       }
     };
     ```

  4. Add a new `TableHead` column header (Actions column — add after "最後更新"):
     ```tsx
     <TableHead className="w-[100px]">操作</TableHead>
     ```
     Also update the `colSpan={6}` on the empty state row to `colSpan={7}`.
     Also update the skeleton rows from 6 cells to 7 cells (add a skeleton cell for the new column).

  5. Inside each channel row (`channels.map(...)`), add a `TableCell` with the button at the end:
     ```tsx
     <TableCell onClick={(e) => e.stopPropagation()}>
       {channel.status === "active" && (
         <Button
           size="sm"
           variant="outline"
           data-testid="fetch-now-btn"
           disabled={fetchingChannels.has(channel.id)}
           onClick={(e) => handleFetchNow(e, channel.id)}
         >
           {fetchingChannels.has(channel.id) ? "同步中..." : "立即同步"}
         </Button>
       )}
     </TableCell>
     ```
     Note: The `onClick` on `TableCell` stops propagation so clicking anywhere in the cell (not just the button) doesn't navigate away.

  **Must NOT do**:
  - Do NOT show or render the button for non-active channels (render nothing for status !== "active")
  - Do NOT add `disabled` styling for non-active channels — just hide it
  - Do NOT use `as any` or `@ts-ignore`
  - Do NOT touch any other part of the file (no dialog changes, no query changes)
  - Do NOT add a toast library — use `console.error` for failures (keep it minimal)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: React component modification with state management, TypeScript, shadcn/ui components
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3) — T4 only depends on T2 (api.ts helper), not T3
  - **Parallel Group**: Wave 2
  - **Blocks**: F2
  - **Blocked By**: Task 2

  **References**:
  - `frontend/src/pages/ChannelListPage.tsx` — full file; understand existing table structure, mutation pattern, state management
  - `frontend/src/lib/api.ts:84-88` — `fetchChannelNow` function added in Task 2
  - `frontend/src/components/ui/button.tsx` — Button component (already imported, just use it)
  - Existing `useMutation` pattern in the file for `createChannel` — shows how async ops with loading state work

  **Acceptance Criteria**:
  - [ ] "立即同步" button appears in each `active` channel row
  - [ ] Button text changes to "同步中..." while fetching
  - [ ] Button is NOT rendered for non-active channels
  - [ ] Clicking button does NOT navigate to channel detail page
  - [ ] On success, channel list refreshes (query invalidated)
  - [ ] `cd frontend && pnpm build` → exit 0 (no TypeScript errors)

  **QA Scenarios**:
  ```
  Scenario: TypeScript build passes with button added
    Tool: Bash
    Steps:
      1. Run: cd frontend && pnpm build 2>&1 | tail -30
      2. Assert: exit code 0, no errors
    Expected Result: Build succeeds
    Evidence: .sisyphus/evidence/task-4-frontend-build.txt

  Scenario: Button visible for active channel, hidden for inactive
    Tool: Bash (grep)
    Preconditions: File edited as specified
    Steps:
      1. grep -n "fetch-now-btn\|立即同步\|fetchingChannels" frontend/src/pages/ChannelListPage.tsx
      2. Assert: all three strings appear in the file
      3. Assert: button render is inside `{channel.status === "active" && (...)}`
    Expected Result: Button correctly gated on active status
    Evidence: .sisyphus/evidence/task-4-button-gating.txt
  ```

  **Commit**: YES (group with T2)
  - Message: `feat(frontend): add fetch-now button to channel list`
  - Files: `frontend/src/lib/api.ts`, `frontend/src/pages/ChannelListPage.tsx`
  - Pre-commit: `cd frontend && pnpm build`

---

## Final Verification Wave

> Run these after ALL tasks complete. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Regression check** — `unspecified-high`
  Run `cd backend && .venv/bin/pytest tests/ -v`. All 62 original tests must pass. New tests must also pass. Output: `N pass / 0 fail`. Any failure = reject.

- [x] F2. **Frontend build check** — `quick`
  Run `cd frontend && pnpm build`. Must exit 0. Output build summary. Any TypeScript error = reject.

- [x] F3. **API smoke test** — `unspecified-high`
  Start the backend (`cd backend && uvicorn youtube_monitor.main:app --port 8000 &`), create a test channel, call `POST /api/channels/{id}/fetch` (mocking or using a real API key). Verify 200 response shape. Verify 404 for non-existent channel. Verify quota guard returns 429 when fake FetchLog exhausts quota.

---

## Commit Strategy

- All four tasks: `feat(channels): add per-channel fetch-now endpoint and button`
  Pre-commit: `cd backend && .venv/bin/pytest tests/ -v`

---

## Success Criteria

### Verification Commands
```bash
cd backend && .venv/bin/pytest tests/ -v  # Expected: all tests pass
cd frontend && pnpm build                 # Expected: exit 0
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (original 62 + new tests)
- [ ] Frontend builds clean
