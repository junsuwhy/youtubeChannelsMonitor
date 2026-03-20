# YouTube 頻道監控平台 — Phase 1 MVP 實作計劃

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## TL;DR

> **Quick Summary**: 從零建立 YouTube 內容農場監控平台的 Phase 1 MVP，包含三個子系統：Collector（排程爬蟲）、Backend（FastAPI REST API）、Dashboard（React 前端），使用 SQLite 作為資料庫便於搬遷。
>
> **Deliverables**:
> - 完整的 SQLite 資料庫 schema（6 個資料表 + Alembic migration）
> - FastAPI 後端 API（頻道 CRUD、影片查詢、系統監控）
> - APScheduler 排程爬蟲（頻道快照、影片發現、影片統計快照）
> - React + shadcn/ui Dashboard（首頁總覽、頻道列表、頻道詳情、影片列表）
> - Docker Compose 部署配置（backend + frontend + nginx）
>
> **Estimated Effort**: XL（4-5 週）
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 5 → Task 8 → Task 12 → Task 15 → Task 19 → F1-F4

---

## Context

### Original Request
建立 YouTube 頻道監控平台，SQLite 選項以便搬遷，實作 Phase 1 MVP。

### Interview Summary

**Key Discussions**:
- **資料庫**: SQLite（使用者指定，使用 SQLAlchemy 2.0 async + Alembic migration）
- **語言/框架**: Python 3.12 + FastAPI（spec 推薦）
- **排程**: APScheduler 3.x（AsyncIOScheduler）
- **前端**: React + Vite + TypeScript + shadcn/ui + Tailwind CSS + TanStack Query v5 + Recharts
- **部署**: Docker Compose 單機

**Research Findings**:
- SQLite + async SQLAlchemy 必須使用 `NullPool` 否則會出現 `database is locked`
- APScheduler + 多個 uvicorn workers = 工作重複執行，必須 `--workers 1`
- `expire_on_commit=True`（預設）+ async sessions = `MissingGreenlet` 崩潰
- Recharts 對輪詢數據必須設 `isAnimationActive={false}`
- TanStack Query v5 已將 `cacheTime` 改名為 `gcTime`

### Metis Review

**Identified Gaps** (addressed):
- SQLite async 配置陷阱 → 已加入強制技術規範
- APScheduler 重複執行問題 → 強制 `max_instances=1`
- Alembic 靜默失敗問題 → 必須 import 所有 models
- 前端空狀態 UI → 所有列表頁必須有 empty state
- 影片消失/私人化處理 → soft-update `status` 欄位

**Decisions Resolved**:
1. **配額耗盡觸發行為** → 拒絕觸發，回傳 429（先檢查剩餘配額）
2. **Phase 1 認證** → 需要 JWT 認證（全部 API 端點保護）+ 多使用者 `users` 資料表 + `.env` 可自定義 access/refresh token 有效期
3. **批次頻道匯入** → 新增一頁批次匯入頁（multiline text form，一行一個 channel ID）

---

## Work Objectives

### Core Objective
建立可在單機部署、以 SQLite 儲存的 YouTube 頻道監控平台 Phase 1 MVP，支援手動管理監控頻道、每日自動抓取數據、以及基礎視覺化 Dashboard。

### Concrete Deliverables
- `backend/` — FastAPI 應用，含 SQLAlchemy models（含 users）、Alembic migrations、Collector jobs、REST API、JWT auth middleware
- `frontend/` — Vite + React SPA，含 Login 頁、5 個主要功能頁面（Dashboard、頻道列表、頻道詳情、影片列表、批次匯入）
- `docker-compose.yml` — 一鍵部署配置（backend + frontend/nginx）
- `README.md` — 開發環境設置與部署說明（含 admin 帳號初始化）

### Definition of Done
- [ ] `docker compose up` 後所有服務健康啟動
- [ ] `curl http://localhost:8000/health` 回傳 `{"status": "ok"}`
- [ ] 可透過 API 新增頻道並在 Dashboard 看到
- [ ] 手動觸發 collector 後可在 Dashboard 看到快照數據
- [ ] `pytest tests/ -v` 全部通過

### Must Have
- SQLite 搭配 WAL 模式（`journal_mode=WAL`）確保讀寫並行
- Alembic async 初始化（`alembic init -t async`）
- `NullPool` 用於所有非測試環境的 SQLite 連線
- APScheduler `max_instances=1` 防止工作重疊
- Docker volume 持久化 SQLite 檔案
- 所有 YouTube API 呼叫包裝在 `run_in_executor` 中
- Soft delete（`status='inactive'`）而非硬刪除
- Upsert 而非 INSERT for snapshots（防止重複執行問題）
- **JWT 認證系統**：`users` 資料表（多使用者）+ `/api/auth/login` + `/api/auth/refresh` + Bearer Token middleware（全部 API 端點保護）
- **JWT 設定**：access token 與 refresh token 有效期均可透過 `.env` 自定義（`ACCESS_TOKEN_EXPIRE_MINUTES`、`REFRESH_TOKEN_EXPIRE_DAYS`）
- **配額 429**：`POST /api/system/fetch/trigger` 先檢查剩餘配額，不足時回傳 `HTTP 429 Too Many Requests`
- **批次頻道匯入頁**：前端一頁 multiline textarea，一行一個 YouTube channel ID，支援一次新增多個頻道

### Must NOT Have (Guardrails)
- ❌ `search.list` API 呼叫（100 units/call，禁用）
- ❌ 異常偵測功能（Phase 2）
- ❌ CSV/JSON/PDF 匯出功能（Phase 2）
- ❌ Cofacts 整合（Phase 3）
- ❌ `POST /api/external/discover` 端點（Phase 3）
- ❌ 多 API Key 輪替（Phase 4）
- ❌ 使用者角色權限管理（Phase 4，Phase 1 所有登入使用者有完整權限）
- ❌ Redis / Celery / 任何額外服務（Phase 1 僅 backend + nginx）
- ❌ `uvicorn --workers N>1`（會破壞 APScheduler + SQLite 組合）
- ❌ `expire_on_commit=True` 在 async session（會導致 MissingGreenlet）
- ❌ 無任何認證的 API 端點（全部端點必須有 JWT Bearer Token，除了 `/api/auth/login`、`/health`）

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO（新建）
- **Automated tests**: YES（TDD — RED-GREEN-REFACTOR）
- **Framework**: `pytest` + `pytest-asyncio` + `httpx` (async test client) + `Playwright`
- **Test DB**: `StaticPool` in-memory SQLite（所有測試，不使用真實檔案）
- **YouTube API**: 完全 mock（`unittest.mock.AsyncMock` / `respx`）— 絕不呼叫真實 API

### QA Policy
- **Backend**: Bash (`curl`) + pytest
- **Frontend/UI**: Playwright（`playwright` skill）
- **Collector**: pytest + mock YouTube client
- Evidence: `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: 專案結構初始化 [quick]
├── Task 2: SQLAlchemy Models + Alembic async 設置（含 users 表）[unspecified-high]
└── Task 3: Docker Compose skeleton [quick]

Wave 2 (After Wave 1 — backend core):
├── Task 4: SQLite async 引擎配置（WAL + NullPool + pragmas）[unspecified-high]
├── Task 5: JWT Auth 系統（users table + /api/auth/login + /api/auth/refresh + Bearer middleware）[unspecified-high]
├── Task 6: Channels API 端點（CRUD，全部需 JWT）[unspecified-high]
├── Task 7: Videos + Snapshots 查詢 API（全部需 JWT）[unspecified-high]
└── Task 8: System API（quota 429 + logs + trigger，全部需 JWT）[unspecified-high]

Wave 3 (After Task 6+8 — collector):
├── Task 9: YouTube API client wrapper [deep]
├── Task 10: Collector Job — 頻道統計快照 [deep]
├── Task 11: Collector Job — 影片發現 [deep]
└── Task 12: Collector Job — 影片統計快照 [deep]

Wave 4 (After Wave 2 complete — frontend):
├── Task 13: React 前端鷹架（Vite + TS + shadcn/ui + TanStack Query + JWT axios interceptor）[visual-engineering]
├── Task 14: Login 頁面（JWT auth flow）[visual-engineering]
├── Task 15: Dashboard 首頁總覽頁 [visual-engineering]
├── Task 16: 頻道列表頁 [visual-engineering]
└── Task 17: 頻道詳情頁（含趨勢圖）[visual-engineering]

Wave 5 (After Wave 3 + Wave 4):
├── Task 18: APScheduler 整合（FastAPI lifespan）[unspecified-high]
├── Task 19: 影片列表頁 [visual-engineering]
├── Task 20: 批次頻道匯入頁（multiline textarea，一行一個 channel ID）[visual-engineering]
└── Task 21: Nginx 配置 + Docker Compose 最終化 [quick]

Wave 6 (After All):
└── Task 22: README + 文件（含 admin 帳號初始化說明）[writing]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan Compliance Audit [oracle]
├── Task F2: Code Quality Review [unspecified-high]
├── Task F3: Real Manual QA [unspecified-high]
└── Task F4: Scope Fidelity Check [deep]
→ Present results → Wait for explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2, 3, 4, 13 |
| 2 | 1 | 4, 5, 6, 7, 8, 9 |
| 3 | 1 | 21 |
| 4 | 1, 2 | 5, 6, 7, 8, 9 |
| 5 | 2, 4 | 6, 7, 8, 14 |
| 6 | 2, 4, 5 | 9, 16 |
| 7 | 2, 4, 5 | 15, 19 |
| 8 | 2, 4, 5 | 18 |
| 9 | 2, 4, 5 | 10, 11, 12 |
| 10 | 9 | 18 |
| 11 | 9 | 18 |
| 12 | 9 | 18 |
| 13 | 1 | 14, 15, 16, 17, 19, 20 |
| 14 | 13 | 15, 16, 17, 19, 20 |
| 15 | 6, 7, 13, 14 | — |
| 16 | 6, 13, 14 | — |
| 17 | 7, 13, 14 | 19 |
| 18 | 8, 10, 11, 12 | 21 |
| 19 | 7, 13, 14 | — |
| 20 | 6, 13, 14 | — |
| 21 | 3, 18 | 22 |
| 22 | 21 | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick`, T2 → `unspecified-high`, T3 → `quick`
- **Wave 2**: T4 → `unspecified-high`, T5 → `unspecified-high`, T6 → `unspecified-high`, T7 → `unspecified-high`, T8 → `unspecified-high`
- **Wave 3**: T9 → `deep`, T10 → `deep`, T11 → `deep`, T12 → `deep`
- **Wave 4**: T13 → `visual-engineering`, T14 → `visual-engineering`, T15 → `visual-engineering`, T16 → `visual-engineering`, T17 → `visual-engineering`
- **Wave 5**: T18 → `unspecified-high`, T19 → `visual-engineering`, T20 → `visual-engineering`, T21 → `quick`
- **Wave 6**: T22 → `writing`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. 專案結構初始化

  **What to do**:
  - 建立專案根目錄結構：`backend/`, `frontend/`, `nginx/`, `docs/`
  - 建立 `backend/pyproject.toml`（使用 [project] 格式，Python 3.12+）
    ```toml
    [project]
    name = "youtube-monitor"
    version = "0.1.0"
    requires-python = ">=3.12"
    dependencies = [
        "fastapi>=0.115",
        "uvicorn[standard]>=0.30",
        "sqlalchemy[asyncio]>=2.0",
        "alembic>=1.13",
        "aiosqlite>=0.20",
        "apscheduler>=3.10",
        "google-api-python-client>=2.140",
        "pydantic-settings>=2.5",
        "python-dotenv>=1.0",
        "python-jose[cryptography]>=3.3",
        "passlib[bcrypt]>=1.7",
        "python-multipart>=0.0.12",
    ]

    [project.optional-dependencies]
    dev = [
        "pytest>=8.3",
        "pytest-asyncio>=0.24",
        "httpx>=0.27",
        "pytest-cov>=5.0",
        "ruff>=0.7",
        "mypy>=1.12",
    ]
    ```
  - 建立 `backend/src/youtube_monitor/` package（含 `__init__.py`）
  - 建立子模組結構：
    - `backend/src/youtube_monitor/main.py` — FastAPI app 入口
    - `backend/src/youtube_monitor/config.py` — Pydantic Settings
    - `backend/src/youtube_monitor/database.py` — 引擎/session 設定（WAL + NullPool 骨架）
    - `backend/src/youtube_monitor/models/` — ORM models 目錄
    - `backend/src/youtube_monitor/api/` — 路由目錄
    - `backend/src/youtube_monitor/collector/` — 爬蟲目錄
    - `backend/tests/` — 測試目錄（含 `conftest.py` 骨架）
  - 建立 `frontend/` 用 Vite 初始化（`pnpm create vite frontend --template react-ts`）
  - 建立 `.env.example`：
    ```
    YOUTUBE_API_KEY=your_api_key_here
    DATABASE_URL=sqlite+aiosqlite:///./data/app.db
    ENVIRONMENT=development
    SECRET_KEY=your-secret-key-here
    ACCESS_TOKEN_EXPIRE_MINUTES=60
    REFRESH_TOKEN_EXPIRE_DAYS=7
    ```
  - 建立 `.gitignore`（含 `.env`, `*.db`, `__pycache__`, `node_modules`, `.venv`）
  - 建立 `backend/tests/conftest.py` 骨架（空 fixtures，稍後填入）

  **Must NOT do**:
  - 不要安裝任何依賴（只建結構和配置文件）
  - 不要包含 Redis、Celery 或任何 Phase 1 範圍外的依賴
  - 不要使用 `app.on_event("startup")` — 等 Task 16 用 lifespan

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 1）
  - **Parallel Group**: Wave 1（with Tasks 2, 3）
  - **Blocks**: Tasks 2, 3, 4, 13
  - **Blocked By**: None（can start immediately）

  **References**:
  - `spec.md:498-513` — 技術選型建議（確認語言/框架版本）
  - [FastAPI 官方文件結構建議](https://fastapi.tiangolo.com/tutorial/bigger-applications/)
  - [Vite + React + TypeScript 模板](https://vitejs.dev/guide/#scaffolding-your-first-vite-project)

  **Acceptance Criteria**:
  - [ ] `ls backend/src/youtube_monitor/` 顯示所有子目錄
  - [ ] `ls frontend/src/` 顯示 Vite 初始化後的文件
  - [ ] `.env.example` 存在且包含 `YOUTUBE_API_KEY`, `DATABASE_URL`
  - [ ] `cat backend/pyproject.toml | grep sqlalchemy` 顯示 `sqlalchemy[asyncio]`

  **QA Scenarios**:

  ```
  Scenario: 專案結構完整性檢查
    Tool: Bash
    Preconditions: Task 1 完成後
    Steps:
      1. find backend/src/youtube_monitor -type d → 應列出 models, api, collector 等子目錄
      2. test -f backend/pyproject.toml && echo "EXISTS" → 應輸出 EXISTS
      3. test -f .env.example && echo "EXISTS" → 應輸出 EXISTS
      4. test -f frontend/package.json && echo "EXISTS" → 應輸出 EXISTS
    Expected Result: 所有文件和目錄存在
    Evidence: .sisyphus/evidence/task-1-structure-check.txt

  Scenario: 沒有非 Phase 1 依賴
    Tool: Bash
    Steps:
      1. grep -E "redis|celery|flower" backend/pyproject.toml → 應無輸出
    Expected Result: 無禁用依賴
    Evidence: .sisyphus/evidence/task-1-no-forbidden-deps.txt
  ```

  **Commit**: YES
  - Message: `chore: initialize project structure`
  - Files: `backend/`, `frontend/`, `.env.example`, `.gitignore`

- [x] 2. SQLAlchemy Models + Alembic async 設置

  **What to do**:
  - 安裝後端依賴：`cd backend && pip install -e ".[dev]"`
  - 建立 `backend/src/youtube_monitor/models/base.py`：
    ```python
    import uuid
    from sqlalchemy.orm import DeclarativeBase, MappedColumn, mapped_column
    from sqlalchemy.ext.asyncio import AsyncAttrs
    from sqlalchemy import func
    import datetime

    class Base(AsyncAttrs, DeclarativeBase):
        pass
    ```
  - 建立 `backend/src/youtube_monitor/models/channel.py`（Channel model，欄位照 spec 3.1）：
    - 使用 `mapped_column()` 語法（SQLAlchemy 2.0 風格）
    - `id`: `Integer` PK，autoincrement（SQLite 相容，不用 UUID）
    - `youtube_channel_id`: `String(24)`, unique, index=True
    - `tags`: `JSON` 欄位（SQLite 用 JSON，代替 PostgreSQL `TEXT[]`）
    - `status`: `String(20)`, default=`'active'`
    - `source`: `String(50)`, default=`'manual'`
    - `created_at`, `updated_at`: `DateTime`, server_default=`func.now()`
  - 建立 `backend/src/youtube_monitor/models/channel_snapshot.py`（ChannelSnapshot model，spec 3.2）：
    - UniqueConstraint on `(channel_id, snapshot_date)`
  - 建立 `backend/src/youtube_monitor/models/video.py`（Video model，spec 3.3）：
    - `tags`, `topic_categories`: `JSON`
    - `duration`: `String(20)`（儲存 ISO 8601 字串如 `PT5M30S`）
  - 建立 `backend/src/youtube_monitor/models/video_snapshot.py`（VideoSnapshot，spec 3.4）：
    - UniqueConstraint on `(video_id, snapshot_date)`
  - 建立 `backend/src/youtube_monitor/models/fetch_log.py`（FetchLog，spec 3.5）
  - 建立 `backend/src/youtube_monitor/models/cofacts_source.py`（CofactsSource，spec 3.6，只建 stub，不實作功能）
  - 建立 `backend/src/youtube_monitor/models/user.py`（User model，JWT auth 使用）：
    - `id`: Integer PK autoincrement
    - `username`: `String(50)`, unique, index=True
    - `email`: `String(255)`, unique, nullable
    - `hashed_password`: `String(255)`, not null
    - `is_active`: `Boolean`, default=True
    - `created_at`, `updated_at`: `DateTime`, server_default=`func.now()`
  - 建立 `backend/src/youtube_monitor/models/__init__.py`（匯出所有 models，含 User）
  - 初始化 Alembic：`cd backend && alembic init -t async alembic`
  - 修改 `backend/alembic/env.py`：
    ```python
    # 必須在 target_metadata 之前 import 所有 models
    from youtube_monitor.models import Base, Channel, ChannelSnapshot, Video, VideoSnapshot, FetchLog, CofactsSource, User
    target_metadata = Base.metadata
    ```
  - 修改 `backend/alembic.ini`：`sqlalchemy.url = sqlite+aiosqlite:///./data/app.db`
  - 產生第一個 migration：`alembic revision --autogenerate -m "initial schema"`
  - 檢查生成的 migration 文件確認所有 6 個資料表都在

  **Test cases to cover** (寫在 `backend/tests/test_models.py`):
  - Upsert 行為：同一 `(channel_id, snapshot_date)` 插入兩次 → 不拋出錯誤，row count = 1
  - Unique constraint：相同 `youtube_channel_id` 插入兩次 → 拋出 IntegrityError
  - JSON 欄位：`tags = ["健康謠言", "政治"]` 可正確儲存和讀取
  - `Base` 有 `AsyncAttrs` mixin（確保非同步屬性存取不會崩潰）
  - User model：`hashed_password` 欄位存在且不為空

  **Must NOT do**:
  - 不要使用 `alembic init`（不帶 `-t async`）— 必須是 async 模板
  - 不要使用 UUID 作為 PK（SQLite 效能較差，用 Integer autoincrement）
  - 不要使用 PostgreSQL 特有型別（`ARRAY`, `JSONB`）— 用 `JSON`
  - 不要在 `env.py` 省略任何 model import

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `visual-engineering`（純後端，無 UI）

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 1，與 Tasks 1, 3 並行）
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 4, 5, 6, 7, 8, 9
  - **Blocked By**: Task 1

  **References**:
  - `spec.md:63-176` — 完整資料模型定義（6 個資料表）
  - [SQLAlchemy 2.0 Mapped Column 語法](https://docs.sqlalchemy.org/en/20/orm/declarative_tables.html)
  - [Alembic async 模板](https://alembic.sqlalchemy.org/en/latest/cookbook.html#using-asyncio-with-alembic)
  - [AsyncAttrs mixin 文件](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#preventing-implicit-io-when-using-asyncsession)

  **Acceptance Criteria**:
  - [ ] `alembic upgrade head` 成功執行，建立所有 7 個資料表
  - [ ] `sqlite3 app.db .tables` 輸出包含：`channels`, `channel_snapshots`, `videos`, `video_snapshots`, `fetch_logs`, `cofacts_sources`, `users`
  - [ ] `pytest tests/test_models.py -v` — 所有 model 測試通過
  - [ ] Alembic migration 文件存在於 `backend/alembic/versions/`

  **QA Scenarios**:

  ```
  Scenario: Migration 正確建立所有資料表
    Tool: Bash
    Preconditions: alembic upgrade head 已執行
    Steps:
      1. sqlite3 data/app.db ".tables" → 輸出應包含所有 6 個表名
      2. sqlite3 data/app.db "PRAGMA table_info(channels)" → 應顯示所有欄位
    Expected Result: 6 個資料表全部存在，channels 有正確欄位
    Evidence: .sisyphus/evidence/task-2-migration-tables.txt

  Scenario: Upsert 行為（防止重複執行問題）
    Tool: Bash (pytest)
    Steps:
      1. pytest tests/test_models.py::test_channel_snapshot_upsert -v
    Expected Result: PASS — 插入兩次相同 (channel_id, snapshot_date) 不拋出錯誤，row count = 1
    Evidence: .sisyphus/evidence/task-2-upsert-test.txt

  Scenario: Unique constraint 測試
    Tool: Bash (pytest)
    Steps:
      1. pytest tests/test_models.py::test_channel_unique_constraint -v
    Expected Result: PASS — 重複 youtube_channel_id 拋出 IntegrityError
    Evidence: .sisyphus/evidence/task-2-unique-constraint.txt
  ```

  **Commit**: YES
  - Message: `feat: add SQLAlchemy models and Alembic async migration`
  - Files: `backend/src/youtube_monitor/models/`, `backend/alembic/`, `backend/alembic.ini`, `backend/tests/test_models.py`

- [x] 3. Docker Compose skeleton

  **What to do**:
  - 建立 `docker-compose.yml` 骨架（backend + frontend services，暫時沒有完整配置）：
    ```yaml
    version: "3.9"
    services:
      backend:
        build: ./backend
        ports:
          - "8000:8000"
        volumes:
          - db-data:/app/data
        environment:
          - YOUTUBE_API_KEY=${YOUTUBE_API_KEY}
          - DATABASE_URL=sqlite+aiosqlite:////app/data/app.db
        healthcheck:
          test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
          interval: 30s
          timeout: 10s
          retries: 3
          start_period: 10s

      frontend:
        build: ./frontend
        ports:
          - "3000:80"
        depends_on:
          backend:
            condition: service_healthy

    volumes:
      db-data:
    ```
  - 建立 `backend/Dockerfile` 骨架：
    ```dockerfile
    FROM python:3.12-slim
    WORKDIR /app
    COPY pyproject.toml .
    RUN pip install -e .
    COPY src/ src/
    COPY alembic/ alembic/
    COPY alembic.ini .
    RUN mkdir -p /app/data
    # IMPORTANT: --workers 1 is MANDATORY
    # SQLite + APScheduler requires single process to prevent job duplication
    # and avoid "database is locked" errors. DO NOT change this.
    CMD ["uvicorn", "youtube_monitor.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
    ```
  - 建立 `frontend/Dockerfile` 骨架（nginx serve）：
    ```dockerfile
    FROM node:20-slim AS builder
    WORKDIR /app
    COPY package.json pnpm-lock.yaml ./
    RUN npm install -g pnpm && pnpm install
    COPY . .
    RUN pnpm build

    FROM nginx:alpine
    COPY --from=builder /app/dist /usr/share/nginx/html
    COPY nginx.conf /etc/nginx/conf.d/default.conf
    ```
  - 建立 `nginx/nginx.conf`（含 API proxy + SPA routing）：
    ```nginx
    server {
        listen 80;
        root /usr/share/nginx/html;
        index index.html;

        # API proxy to backend
        location /api/ {
            proxy_pass http://backend:8000;
            proxy_set_header Host $host;
        }

        # SPA routing — MUST have try_files for React Router to work
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
    ```
  - 建立 `frontend/vite.config.ts` 加入開發環境 API proxy：
    ```typescript
    server: {
      proxy: {
        '/api': 'http://localhost:8000',
      },
    }
    ```
  - 建立 `.dockerignore`（含 `node_modules`, `__pycache__`, `.env`, `*.db`）

  **Must NOT do**:
  - 不要加入 Redis、Celery、Flower、任何監控 stack
  - 不要在 CMD 使用 `--workers 2` 或更多
  - 不要 `depends_on` 沒有 `condition: service_healthy`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 1）
  - **Parallel Group**: Wave 1（與 Tasks 1, 2 並行）
  - **Blocks**: Task 21
  - **Blocked By**: Task 1

  **References**:
  - `spec.md:505-509` — 技術選型（Docker Compose 單機）
  - [nginx SPA routing 配置](https://www.nginx.com/resources/wiki/start/topics/recipes/try_files/)

  **Acceptance Criteria**:
  - [ ] `docker compose config` 無錯誤
  - [ ] `cat backend/Dockerfile | grep "workers 1"` 顯示有 `--workers 1`
  - [ ] `cat nginx/nginx.conf | grep "try_files"` 顯示 try_files 配置
  - [ ] `cat nginx/nginx.conf | grep "proxy_pass"` 顯示 API proxy 配置

  **QA Scenarios**:

  ```
  Scenario: Docker Compose 配置有效性
    Tool: Bash
    Steps:
      1. docker compose config → 應無錯誤輸出
    Expected Result: 配置解析成功
    Evidence: .sisyphus/evidence/task-3-compose-config.txt

  Scenario: workers 1 強制確認
    Tool: Bash
    Steps:
      1. grep -n "workers" backend/Dockerfile → 應顯示 "--workers 1"
      2. grep -c "workers 1" backend/Dockerfile → 應輸出 1
    Expected Result: 只有 --workers 1，無其他 workers 配置
    Evidence: .sisyphus/evidence/task-3-workers-check.txt
  ```

  **Commit**: YES
  - Message: `chore: add Docker Compose skeleton with nginx`
  - Files: `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, `nginx/nginx.conf`

- [x] 4. SQLite async 引擎配置（WAL + NullPool + Pragmas）

  **What to do**:
  - 實作 `backend/src/youtube_monitor/database.py`：
    ```python
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy.pool import NullPool, StaticPool
    from sqlalchemy import event, text
    from typing import AsyncGenerator
    import os

    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/app.db")

    def _get_engine_kwargs(url: str) -> dict:
        """NullPool for file-based SQLite; StaticPool for in-memory (tests)."""
        if ":memory:" in url:
            return {"poolclass": StaticPool, "connect_args": {"check_same_thread": False}}
        return {"poolclass": NullPool}

    engine = create_async_engine(DATABASE_URL, **_get_engine_kwargs(DATABASE_URL))

    # Set WAL mode and other pragmas on every new connection
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragmas(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        # WAL mode: allows concurrent reads while writing
        cursor.execute("PRAGMA journal_mode=WAL")
        # NORMAL sync: balance between safety and performance
        cursor.execute("PRAGMA synchronous=NORMAL")
        # Busy timeout: wait up to 5s if DB is locked before raising error
        cursor.execute("PRAGMA busy_timeout=5000")
        # Foreign keys: enforce referential integrity
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    # expire_on_commit=False is MANDATORY for async sessions
    # If True (default), accessing attributes after commit raises MissingGreenlet
    AsyncSessionLocal = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def get_session() -> AsyncGenerator[AsyncSession, None]:
        async with AsyncSessionLocal() as session:
            yield session
    ```
  - 實作 `backend/src/youtube_monitor/config.py`（Pydantic Settings）：
    ```python
    from pydantic_settings import BaseSettings

    class Settings(BaseSettings):
        youtube_api_key: str = ""
        database_url: str = "sqlite+aiosqlite:///./data/app.db"
        environment: str = "development"
        timezone: str = "Asia/Taipei"  # UTC+8

        class Config:
            env_file = ".env"

    settings = Settings()
    ```
  - 建立 `backend/tests/conftest.py`（測試 fixtures）：
    ```python
    import pytest
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy.pool import StaticPool
    from youtube_monitor.models.base import Base
    from youtube_monitor.database import set_sqlite_pragmas

    @pytest.fixture
    async def test_engine():
        """In-memory SQLite engine for tests — StaticPool keeps same connection."""
        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
        # Apply same pragmas as production
        from sqlalchemy import event
        event.listen(engine.sync_engine, "connect", set_sqlite_pragmas)

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        yield engine
        await engine.dispose()

    @pytest.fixture
    async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
        async_session = async_sessionmaker(test_engine, expire_on_commit=False)
        async with async_session() as session:
            yield session
    ```
  - 撰寫 `backend/tests/test_database.py`：
    - 測試 WAL 模式已啟用：`PRAGMA journal_mode` 回傳 `wal`
    - 測試 foreign_keys 已啟用：`PRAGMA foreign_keys` 回傳 `1`
    - 測試 `expire_on_commit=False`：commit 後存取屬性不拋出 `MissingGreenlet`

  **Must NOT do**:
  - 不要在非測試環境使用 `StaticPool`（記憶體中，重啟後資料消失）
  - 不要使用預設 connection pool（file-based SQLite 必須用 `NullPool`）
  - 不要省略 `expire_on_commit=False`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 2，與 Tasks 5, 6, 7 並行，但須先等 Tasks 1, 2）
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 5, 6, 7, 8
  - **Blocked By**: Tasks 1, 2

  **References**:
  - [SQLAlchemy NullPool for SQLite](https://docs.sqlalchemy.org/en/20/dialects/sqlite.html#connect-strings)
  - [SQLAlchemy asyncio 文件](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
  - [WAL mode in SQLite](https://www.sqlite.org/wal.html)
  - Metis 分析：SQLite + async 需要 `NullPool`，`expire_on_commit=False` 防止 MissingGreenlet

  **Acceptance Criteria**:
  - [ ] `pytest tests/test_database.py -v` — 全部通過
  - [ ] 測試確認 WAL 模式啟用（`PRAGMA journal_mode` = `wal`）
  - [ ] 測試確認 `expire_on_commit=False` 不拋出 MissingGreenlet

  **QA Scenarios**:

  ```
  Scenario: WAL 模式正確啟用
    Tool: Bash (pytest)
    Steps:
      1. pytest tests/test_database.py::test_wal_mode_enabled -v
    Expected Result: PASS — PRAGMA journal_mode 回傳 "wal"
    Evidence: .sisyphus/evidence/task-4-wal-mode.txt

  Scenario: expire_on_commit=False 防止 MissingGreenlet
    Tool: Bash (pytest)
    Steps:
      1. pytest tests/test_database.py::test_no_missing_greenlet -v
    Expected Result: PASS — commit 後存取屬性不拋出錯誤
    Evidence: .sisyphus/evidence/task-4-expire-on-commit.txt
  ```

  **Commit**: YES
  - Message: `feat: configure SQLite async engine with WAL pragmas`
  - Files: `backend/src/youtube_monitor/database.py`, `backend/src/youtube_monitor/config.py`, `backend/tests/conftest.py`, `backend/tests/test_database.py`

- [x] 5. JWT 認證系統（users table + auth endpoints + Bearer middleware）

  **What to do**:
  - 建立 `backend/src/youtube_monitor/auth/security.py`：
    ```python
    from passlib.context import CryptContext
    from jose import JWTError, jwt
    from datetime import datetime, timedelta, timezone

    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    def verify_password(plain: str, hashed: str) -> bool:
        return pwd_context.verify(plain, hashed)

    def get_password_hash(password: str) -> str:
        return pwd_context.hash(password)

    def create_access_token(data: dict, expires_delta: timedelta) -> str:
        to_encode = data.copy()
        to_encode["exp"] = datetime.now(timezone.utc) + expires_delta
        return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")

    def create_refresh_token(data: dict, expires_delta: timedelta) -> str:
        to_encode = {**data, "type": "refresh", "exp": datetime.now(timezone.utc) + expires_delta}
        return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")
    ```
  - 建立 `backend/src/youtube_monitor/auth/deps.py`（Bearer middleware）：
    ```python
    from fastapi import Depends, HTTPException, status
    from fastapi.security import OAuth2PasswordBearer
    from jose import JWTError, jwt
    from sqlalchemy.ext.asyncio import AsyncSession

    oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

    async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
        credentials_exception = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            username: str = payload.get("sub")
            if username is None or payload.get("type") == "refresh":
                raise credentials_exception
        except JWTError:
            raise credentials_exception
        user = await crud.get_user_by_username(db, username)
        if user is None or not user.is_active:
            raise credentials_exception
        return user
    ```
  - 建立 `backend/src/youtube_monitor/api/auth.py`（auth router）：
    - `POST /api/auth/login` — 接受 `username`/`password`（OAuth2PasswordRequestForm），回傳 `access_token` + `refresh_token` + `token_type`
    - `POST /api/auth/refresh` — 接受 `refresh_token`（JSON body），驗證後回傳新的 `access_token`
    - `GET /api/auth/me` — 需 Bearer token，回傳目前使用者資訊
    - 端點不需 JWT 保護：`/api/auth/login`（公開，負責產生 token）
  - 建立 `backend/src/youtube_monitor/crud/user.py`：
    - `create_user(db, username, password, email=None)` — hash password 後寫入 users 表
    - `get_user_by_username(db, username)` — 查詢 users 表
    - `authenticate_user(db, username, password)` — 驗證 + 回傳 User or None
  - 建立 `backend/src/youtube_monitor/management/create_user.py`（CLI 腳本）：
    ```bash
    python -m youtube_monitor.management.create_user --username admin --password <pass>
    ```
    這是初始化第一個使用者的方式。
  - 更新 `backend/src/youtube_monitor/config.py`（加入 JWT settings）：
    ```python
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ```
  - 確認所有其他 API router（channels, videos, system）的每個端點加上 `current_user: User = Depends(get_current_user)`
  - **公開端點（免 JWT）**：僅 `/api/auth/login`、`/health`

  **Test cases to cover** (寫在 `backend/tests/test_auth.py`):
  - `POST /api/auth/login` 正確帳密 → 200，回傳 `access_token` 和 `refresh_token`
  - `POST /api/auth/login` 錯誤密碼 → 401
  - `POST /api/auth/login` 不存在使用者 → 401
  - Bearer token 帶有效 access token → 200
  - Bearer token 帶 refresh token → 401（refresh token 不能用於 API 存取）
  - Bearer token 過期 → 401
  - `POST /api/auth/refresh` 有效 refresh token → 200，新 access_token
  - `POST /api/auth/refresh` 無效 refresh token → 401

  **Must NOT do**:
  - 不要允許 refresh token 直接存取受保護 API（type 欄位必須檢查）
  - 不要在 access token 中儲存密碼 hash
  - 不要硬寫 SECRET_KEY（必須從 `.env` 讀取）
  - 不要允許任何非 `/api/auth/login`、`/health` 的端點跳過 JWT 驗證

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `visual-engineering`（純後端）

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 2，與 Tasks 4, 6, 7, 8 並行）
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 6, 7, 8, 14
  - **Blocked By**: Tasks 2, 4

  **References**:
  - [FastAPI OAuth2 + JWT 官方教學](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/)
  - [python-jose 文件](https://python-jose.readthedocs.io/en/latest/)
  - [passlib bcrypt 文件](https://passlib.readthedocs.io/en/stable/lib/passlib.hash.bcrypt.html)
  - `backend/src/youtube_monitor/models/user.py` — User ORM model（Task 2 建立）

  **Acceptance Criteria**:
  - [ ] `POST /api/auth/login` 使用正確帳密 → 200，body 含 `access_token`、`refresh_token`、`token_type: "bearer"`
  - [ ] `GET /api/channels`（無 Bearer）→ 401
  - [ ] `GET /api/channels`（有效 Bearer）→ 200
  - [ ] `POST /api/auth/refresh`（有效 refresh token）→ 200，新 `access_token`
  - [ ] `pytest tests/test_auth.py -v` → 全部通過（≥8 tests）

  ```
  Scenario: 正常登入取得 token
    Tool: Bash (curl)
    Preconditions: 已用 create_user 建立 admin 帳號
    Steps:
      1. curl -X POST http://localhost:8000/api/auth/login -d "username=admin&password=testpass" -H "Content-Type: application/x-www-form-urlencoded"
      2. 確認 HTTP status = 200
      3. 確認 response body 含 "access_token" 和 "refresh_token" 欄位
    Expected Result: {"access_token": "...", "refresh_token": "...", "token_type": "bearer"}
    Evidence: .sisyphus/evidence/task-5-login-success.json

  Scenario: 無 Bearer token 存取保護端點被拒
    Tool: Bash (curl)
    Steps:
      1. curl -I http://localhost:8000/api/channels
      2. 確認 HTTP status = 401
    Expected Result: HTTP/1.1 401 Unauthorized，body 含 "detail": "Not authenticated"
    Evidence: .sisyphus/evidence/task-5-no-auth-rejected.txt

  Scenario: Refresh token 不能用於 API 存取
    Tool: Bash (curl)
    Steps:
      1. 取得 refresh_token（用登入端點）
      2. curl -H "Authorization: Bearer <refresh_token>" http://localhost:8000/api/channels
      3. 確認 HTTP status = 401
    Expected Result: 401 Unauthorized（refresh token 不能存取 API）
    Evidence: .sisyphus/evidence/task-5-refresh-not-api-token.txt
  ```

  **Commit**: YES
  - Message: `feat(auth): add JWT authentication with multi-user support`
  - Files: `backend/src/youtube_monitor/auth/`, `backend/src/youtube_monitor/api/auth.py`, `backend/src/youtube_monitor/crud/user.py`, `backend/src/youtube_monitor/management/create_user.py`, `backend/tests/test_auth.py`

- [x] 6. Channels CRUD API 端點

  **What to do**:
  - 實作 `backend/src/youtube_monitor/api/channels.py`（FastAPI router）
  - 實作以下端點（照 spec 5.1）：
    - `GET /api/channels` — 列表，支援 `?status=active&page=1&limit=50`
    - `POST /api/channels` — 新增頻道（`youtube_channel_id` + `channel_title` 為必填）
    - `GET /api/channels/{id}` — 詳情
    - `PATCH /api/channels/{id}` — 更新（只允許：`tags`, `status`, `notes`）
    - `DELETE /api/channels/{id}` — **Soft delete**（設 `status='inactive'`，不刪資料行）
  - 實作 Pydantic schemas（`backend/src/youtube_monitor/schemas/channel.py`）：
    - `ChannelCreate` — 輸入驗證
    - `ChannelResponse` — 回應格式
    - `ChannelUpdate` — 部分更新（所有欄位 Optional）
  - **409 Conflict** 處理：重複 `youtube_channel_id` POST 時回傳 409（不是 500）
  - 建立 `backend/src/youtube_monitor/main.py`：
    ```python
    from fastapi import FastAPI
    from contextlib import asynccontextmanager
    from youtube_monitor.api import channels, videos, system, auth

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # 初始化（Task 18 加入 APScheduler）
        yield
        # 清理

    app = FastAPI(title="YouTube Monitor", lifespan=lifespan)
    app.include_router(auth.router, prefix="/api")
    app.include_router(channels.router, prefix="/api")
    app.include_router(videos.router, prefix="/api")
    app.include_router(system.router, prefix="/api")

    @app.get("/health")
    async def health():
        return {"status": "ok"}
    ```
  - 撰寫 `backend/tests/test_channels_api.py`（TDD 先寫測試）：
    - `test_create_channel_success` — 201 Created，回傳含 id 的 JSON
    - `test_create_channel_duplicate_409` — 同 youtube_channel_id，回傳 409
    - `test_list_channels_empty` — 空資料庫回傳 `{"items": [], "total": 0}`
    - `test_list_channels_filter_by_status` — `?status=active` 只回傳 active
    - `test_get_channel_not_found` — 不存在 ID 回傳 404
    - `test_soft_delete_channel` — DELETE 後 status = `inactive`，row 仍存在

  **Must NOT do**:
  - 不要硬刪除（DELETE 端點只能設 `status='inactive'`）
  - 不要允許更新 `youtube_channel_id`（PATCH 不能改）
  - 不要在 channels router 實作批次匯入（Task 20 的批次匯入頁面對應 Task 6 的 `POST /api/channels`，只是前端一次呼叫多次）
  - 所有端點必須有 `current_user: User = Depends(get_current_user)`（Task 5 建立的 dep）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 2）
  - **Parallel Group**: Wave 2（與 Tasks 4, 5, 7, 8 並行）
  - **Blocks**: Tasks 9, 16
  - **Blocked By**: Tasks 2, 4, 5

  **References**:
  - `spec.md:288-311` — Channels API 設計
  - `spec.md:63-86` — channels 資料模型
  - [FastAPI Request Body 文件](https://fastapi.tiangolo.com/tutorial/body/)
  - [SQLAlchemy 2.0 async CRUD 範例](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html#synopsis-core)

  **Acceptance Criteria**:
  - [ ] `pytest tests/test_channels_api.py -v` — 所有 6 個測試通過
  - [ ] `TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login -d "username=admin&password=testpass" | jq -r .access_token) && curl -s -X POST http://localhost:8000/api/channels -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"youtube_channel_id":"UCtest","channel_title":"Test"}' | jq .id` 回傳非 null 值
  - [ ] 重複 POST 同一 `youtube_channel_id` 回傳 HTTP 409
  - [ ] DELETE 後 `sqlite3 app.db "SELECT status FROM channels WHERE id=1"` 輸出 `inactive`

  **QA Scenarios**:

  ```
  Scenario: 新增頻道成功（含 JWT）
    Tool: Bash (curl)
    Preconditions: backend 服務運行中，admin 帳號已建立
    Steps:
      1. TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
           -d "username=admin&password=testpass" \
           -H "Content-Type: application/x-www-form-urlencoded" | jq -r .access_token)
      2. curl -s -X POST http://localhost:8000/api/channels \
           -H "Authorization: Bearer $TOKEN" \
           -H "Content-Type: application/json" \
           -d '{"youtube_channel_id": "UCtest123", "channel_title": "Test Channel"}' \
           | jq '{id, youtube_channel_id, status}'
    Expected Result: {"id": <number>, "youtube_channel_id": "UCtest123", "status": "active"}
    Evidence: .sisyphus/evidence/task-6-create-channel.json

  Scenario: 重複新增回傳 409
    Tool: Bash (curl)
    Preconditions: UCtest123 已存在（上一場景後），TOKEN 已取得
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/channels \
           -H "Authorization: Bearer $TOKEN" \
           -H "Content-Type: application/json" \
           -d '{"youtube_channel_id": "UCtest123", "channel_title": "Test Channel"}'
    Expected Result: 409
    Evidence: .sisyphus/evidence/task-6-duplicate-409.txt

  Scenario: Soft delete 確認
    Tool: Bash (curl + sqlite3)
    Steps:
      1. curl -s -X DELETE http://localhost:8000/api/channels/1 -H "Authorization: Bearer $TOKEN" → HTTP 204
      2. sqlite3 data/app.db "SELECT id, status FROM channels WHERE id=1"
    Expected Result: row 存在，status = "inactive"
    Evidence: .sisyphus/evidence/task-6-soft-delete.txt
  ```

  **Commit**: YES
  - Message: `feat: implement channels CRUD API with soft delete`
  - Files: `backend/src/youtube_monitor/api/channels.py`, `backend/src/youtube_monitor/schemas/channel.py`, `backend/src/youtube_monitor/main.py`, `backend/tests/test_channels_api.py`

- [x] 7. Videos + Snapshots 查詢 API

  **What to do**:
  - 實作 `backend/src/youtube_monitor/api/videos.py`（FastAPI router）
  - 實作以下端點（照 spec 5.2）：
    - `GET /api/videos` — 列表，支援 `?channel_id=&page=1&limit=50`
    - `GET /api/videos/{id}` — 影片詳情
    - `GET /api/videos/{id}/snapshots` — 影片快照歷史（依日期排序）
    - `GET /api/channels/{id}/videos` — 特定頻道的影片列表
  - 實作 Pydantic schemas（`backend/src/youtube_monitor/schemas/video.py`）：
    - `VideoResponse` — 含所有欄位
    - `VideoSnapshotResponse` — 含 `snapshot_date`, `view_count`, `like_count`, `comment_count`
    - `ChannelSnapshotResponse` — 含 `snapshot_date`, `subscriber_count`, `video_count`, `view_count`
  - 加入 `GET /api/channels/{id}/snapshots` — 頻道快照歷史（用於趨勢圖）
  - 加入統計端點（照 spec 5.3）：
    - `GET /api/stats/overview` — 全平台概覽（頻道數、影片數、本週新增）
    - `GET /api/stats/channels/{id}/trend` — 頻道訂閱/觀看趨勢
    - `GET /api/stats/videos/top` — 熱門影片（`?sort_by=view_count&limit=10`）
    - `GET /api/stats/videos/new` — 最新發現影片
  - 撰寫 `backend/tests/test_videos_api.py`：
    - `test_list_videos_empty` — 空資料庫回傳空列表
    - `test_list_videos_filter_by_channel` — `?channel_id=1` 只回傳該頻道影片
    - `test_get_video_snapshots` — 回傳 snapshot 歷史，依 `snapshot_date` ASC 排序
    - `test_stats_overview` — 回傳包含 `total_channels`, `total_videos`, `new_videos_this_week`
    - `test_channel_trend` — 回傳含 `date`, `subscriber_count` 的數列

  **Must NOT do**:
  - 不要實作影片的 POST/PUT/DELETE（影片只由 Collector 寫入）
  - 不要加入異常偵測端點（Phase 2）
  - 不要加入 `GET /api/stats/anomalies`（Phase 2）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 2）
  - **Parallel Group**: Wave 2（與 Tasks 4, 5, 7 並行）
  - **Blocks**: Tasks 15, 17
  - **Blocked By**: Tasks 2, 4

  **References**:
  - `spec.md:309-325` — Videos API + Stats API 設計
  - `spec.md:105-148` — videos 和 video_snapshots 資料模型

  **Acceptance Criteria**:
  - [ ] `pytest tests/test_videos_api.py -v` — 所有測試通過
  - [ ] `GET /api/stats/overview` 回傳包含 `total_channels`, `total_videos` 的 JSON
  - [ ] `GET /api/channels/1/snapshots` 回傳依日期排序的快照列表

  **QA Scenarios**:

  ```
  Scenario: 統計總覽 API 正常運作（含 JWT）
    Tool: Bash (curl)
    Steps:
      1. TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login -d "username=admin&password=testpass" -H "Content-Type: application/x-www-form-urlencoded" | jq -r .access_token)
      2. curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/stats/overview | jq '{total_channels, total_videos}'
    Expected Result: {"total_channels": <number>, "total_videos": <number>}（非 null）
    Evidence: .sisyphus/evidence/task-7-stats-overview.json

  Scenario: 空資料庫下影片列表回傳空陣列（含 JWT）
    Tool: Bash (curl)
    Steps:
      1. curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/videos | jq '.items | length'
    Expected Result: 0
    Evidence: .sisyphus/evidence/task-7-videos-empty.txt
  ```

  **Commit**: YES
  - Message: `feat: implement videos query and stats API`
  - Files: `backend/src/youtube_monitor/api/videos.py`, `backend/src/youtube_monitor/schemas/video.py`, `backend/tests/test_videos_api.py`

- [x] 8. System API（quota 429 + logs + trigger）

  **What to do**:
  - 實作 `backend/src/youtube_monitor/api/system.py`（FastAPI router）
  - 實作以下端點（照 spec 5.4）：
    - `GET /api/system/quota` — 今日配額使用狀況：
      ```json
      {
        "date": "2026-03-20",
        "used_today": 71,
        "quota_limit": 10000,
        "remaining": 9929,
        "percentage_used": 0.71
      }
      ```
    - `GET /api/system/logs` — 爬取紀錄（支援 `?page=1&limit=50&job_type=video_list`）
    - `POST /api/system/fetch/trigger` — 手動觸發立即爬取
      - **先檢查今日剩餘配額**：若 `remaining < 100`（最小安全閾值），立即回傳 `HTTP 429 Too Many Requests`：
        ```json
        {"detail": "Quota insufficient. remaining: 45, required_minimum: 100"}
        ```
      - 若配額充足：觸發所有排程任務立即執行，回傳：
        ```json
        {"status": "triggered", "jobs": ["channel_snapshot", "discover_videos", "video_snapshot"], "quota_remaining": 9929}
        ```
  - 撰寫 `backend/tests/test_system_api.py`：
    - `test_quota_endpoint` — 回傳正確格式，`used_today` 是數字
    - `test_quota_empty_day` — 無 fetch_logs 時，`used_today=0`
    - `test_fetch_logs_pagination` — `?page=2&limit=10` 正確分頁
    - `test_manual_trigger` — 配額充足時回傳 200 含 `jobs` 列表
    - `test_manual_trigger_quota_insufficient` — 配額不足時回傳 429

  **Must NOT do**:
  - 不要在 trigger 端點執行同步 job（只觸發，不等待完成）
  - 配額不足時不要允許繼續觸發（必須回傳 429）
  - 所有端點必須有 `current_user: User = Depends(get_current_user)`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 2）
  - **Parallel Group**: Wave 2（與 Tasks 4, 5, 6, 7 並行）
  - **Blocks**: Task 18
  - **Blocked By**: Tasks 2, 4, 5

  **References**:
  - `spec.md:327-334` — System API 設計
  - `spec.md:153-163` — fetch_logs 資料模型
  - `spec.md:517-525` — 配額監控策略

  **Acceptance Criteria**:
  - [ ] `pytest tests/test_system_api.py -v` — 所有測試通過（≥5 tests）
  - [ ] `TOKEN=... && curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/system/quota | jq .used_today` 回傳數字（不是 null）
  - [ ] 模擬配額不足情境，`POST /api/system/fetch/trigger` 回傳 429（不是 200）

  **QA Scenarios**:

  ```
  Scenario: 配額端點正確回應（含 JWT）
    Tool: Bash (curl)
    Steps:
      1. TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login -d "username=admin&password=testpass" -H "Content-Type: application/x-www-form-urlencoded" | jq -r .access_token)
      2. curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/system/quota | jq '{date, used_today, quota_limit, remaining}'
    Expected Result: 所有欄位均存在，used_today >= 0
    Evidence: .sisyphus/evidence/task-7-quota.json

  Scenario: 手動觸發端點（配額充足）
    Tool: Bash (curl)
    Steps:
      1. curl -s -X POST http://localhost:8000/api/system/fetch/trigger \
           -H "Authorization: Bearer $TOKEN" | jq '{status, jobs}'
      2. 確認回傳 HTTP 200
    Expected Result: {"status": "triggered", "jobs": ["channel_snapshot", "discover_videos", "video_snapshot"], "quota_remaining": <number>}
    Evidence: .sisyphus/evidence/task-8-trigger.json

  Scenario: 配額不足時觸發回傳 429
    Tool: Bash (curl)
    Preconditions: 模擬 fetch_logs 中 used_today 超過 quota_limit - 100（透過 mock 或直接插入測試資料）
    Steps:
      1. 插入足夠多的 fetch_log 記錄使 remaining < 100
      2. curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/system/fetch/trigger \
           -H "Authorization: Bearer $TOKEN"
    Expected Result: 429
    Evidence: .sisyphus/evidence/task-8-trigger-429.txt
  ```

  **Commit**: YES
  - Message: `feat: implement system API endpoints`
  - Files: `backend/src/youtube_monitor/api/system.py`, `backend/tests/test_system_api.py`

- [x] 9. YouTube API Client Wrapper

  **What to do**:
  - 實作 `backend/src/youtube_monitor/collector/youtube_client.py`
  - 建立 `YouTubeClient` class，包裝 `google-api-python-client`：
    ```python
    import asyncio
    from functools import partial
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError

    class QuotaExceededException(Exception):
        """Raised when YouTube API returns 403 quotaExceeded. Do NOT retry."""
        pass

    class YouTubeClient:
        def __init__(self, api_key: str):
            # Build synchronous client (runs in executor)
            self._service = build("youtube", "v3", developerKey=api_key)

        async def _run_in_executor(self, func, *args, **kwargs):
            """Wrap synchronous YouTube API calls for async execution."""
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, partial(func, *args, **kwargs))

        async def get_channel_info(self, channel_id: str) -> dict | None:
            """channels.list: 1 unit per call. Returns channel data or None if not found."""
            ...

        async def get_uploads_playlist_items(
            self, playlist_id: str, max_pages: int = 4
        ) -> list[str]:
            """playlistItems.list: 1 unit per page. Returns list of video IDs.
            Caps at max_pages * 50 = 200 videos per channel to prevent quota runaway."""
            ...

        async def get_video_details(self, video_ids: list[str]) -> list[dict]:
            """videos.list: 1 unit per 50 videos. Returns video metadata + stats."""
            ...
    ```
  - 實作指數退避重試（**只對 429, 500, 503**，不對 403 quotaExceeded）：
    ```python
    import time
    import random

    async def _with_backoff(self, coro_func, max_retries=3):
        for attempt in range(max_retries + 1):
            try:
                return await coro_func()
            except HttpError as e:
                if e.status_code == 403 and "quotaExceeded" in str(e):
                    raise QuotaExceededException(str(e))
                if e.status_code in (429, 500, 503) and attempt < max_retries:
                    wait = (2 ** attempt) + random.uniform(0, 1)
                    await asyncio.sleep(wait)
                    continue
                raise
    ```
  - 在應用啟動時驗證 API key（startup 時呼叫一次輕量 API，如 `channels.list(id="UC_test", maxResults=1)`）
  - **撰寫完整測試** `backend/tests/test_youtube_client.py`（所有 API 都 mock）：
    - `test_get_channel_info_success` — mock 成功回應，確認欄位對應正確（照 spec 4.4）
    - `test_get_channel_info_not_found` — mock 空 items，回傳 None
    - `test_quota_exceeded_raises_exception` — mock 403 quotaExceeded，確認拋出 `QuotaExceededException`
    - `test_backoff_on_503` — mock 503 兩次後成功，確認重試成功不拋出
    - `test_playlist_items_caps_at_200` — mock playlist 有 250 個影片，確認最多回傳 200
    - `test_no_search_list_usage` — `grep -r "search().list" collector/` 確認無 search.list 呼叫

  **Must NOT do**:
  - 不要呼叫 `search.list`（禁用）
  - 不要對 403 quotaExceeded 進行重試（應立即中止）
  - 不要在測試中使用真實 API key

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Reason: 需深度理解 YouTube API 行為、配額邏輯、錯誤處理語義，且非同步包裝需謹慎設計

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 3，與 Tasks 10, 11, 12 並行；但 Tasks 10-12 須等本 task 完成）
  - **Parallel Group**: Wave 3 先行任務
  - **Blocks**: Tasks 10, 11, 12
  - **Blocked By**: Tasks 2, 4, 5

  **References**:
  - `spec.md:184-213` — YouTube API 使用策略與配額規劃
  - `spec.md:228-270` — 欄位對照表（YouTube API → DB）
  - `spec.md:273-281` — 異常處理策略
  - [YouTube Data API channels.list](https://developers.google.com/youtube/v3/docs/channels/list)
  - [YouTube Data API playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list)
  - [YouTube Data API videos.list](https://developers.google.com/youtube/v3/docs/videos/list)
  - [google-api-python-client 文件](https://googleapis.github.io/google-api-python-client/)

  **Acceptance Criteria**:
  - [ ] `pytest tests/test_youtube_client.py -v` — 所有 6 個測試通過
  - [ ] `grep -r "search().list" backend/` 無輸出（確認未呼叫 search.list）
  - [ ] `QuotaExceededException` 已定義且 403 quotaExceeded 時正確拋出（測試驗證）

  **QA Scenarios**:

  ```
  Scenario: 欄位對應正確性
    Tool: Bash (pytest)
    Steps:
      1. pytest tests/test_youtube_client.py::test_get_channel_info_success -v
    Expected Result: PASS — snippet.title → channel_title, statistics.subscriberCount → subscriber_count 等所有欄位正確對應
    Evidence: .sisyphus/evidence/task-8-field-mapping.txt

  Scenario: 配額超限不重試
    Tool: Bash (pytest)
    Steps:
      1. pytest tests/test_youtube_client.py::test_quota_exceeded_raises_exception -v
    Expected Result: PASS — 403 quotaExceeded 立即拋出 QuotaExceededException，不進行任何重試
    Evidence: .sisyphus/evidence/task-8-quota-exceeded.txt

  Scenario: 禁止 search.list 使用
    Tool: Bash
    Steps:
      1. grep -rn "search().list\|searchListRequest" backend/src/ → 應無輸出
    Expected Result: 無 search.list 呼叫
    Evidence: .sisyphus/evidence/task-8-no-search-list.txt
  ```

  **Commit**: YES
  - Message: `feat: implement YouTube API client wrapper with backoff`
  - Files: `backend/src/youtube_monitor/collector/youtube_client.py`, `backend/tests/test_youtube_client.py`

- [x] 10. Collector Job — 頻道統計快照（每日 04:00）

  **What to do**:
  - 實作 `backend/src/youtube_monitor/collector/jobs/channel_snapshot.py`
  - 實作 `run_channel_snapshot_job(session, youtube_client)` 函數：
    ```
    流程：
    1. 查詢所有 status='active' 的頻道（含 youtube_channel_id）
    2. 批次呼叫 youtube_client.get_channel_info（每次最多 50 個）
    3. 更新 channels 表（channel_title, subscriber_count, video_count, view_count, last_fetched_at）
    4. Upsert channel_snapshots（(channel_id, snapshot_date=今日 UTC+8) 用 INSERT OR REPLACE）
    5. 對消失的頻道（channels.list 無回應），設 status='terminated'
    6. 記錄 fetch_logs（job_type='channel_list', status='success'/'failed', api_quota_used=使用量）
    ```
  - **snapshot_date 必須使用 UTC+8 的日期**（不是 `date.today()`）：
    ```python
    from datetime import datetime, timezone, timedelta
    def get_taipei_date() -> date:
        taipei_tz = timezone(timedelta(hours=8))
        return datetime.now(taipei_tz).date()
    ```
  - 使用 `INSERT OR REPLACE` 或 `ON CONFLICT DO UPDATE` 做 upsert（防止重複執行問題）
  - 若頻道表為空，記錄 `fetch_logs` 並優雅結束（不拋出錯誤）
  - 若 `QuotaExceededException`：立即停止，記錄 `fetch_logs(status='failed')`
  - 撰寫 `backend/tests/test_collector_channel_snapshot.py`（所有 YouTube API mock）：
    - `test_snapshot_job_empty_channels` — 空資料庫優雅結束，記錄一個 fetch_log
    - `test_snapshot_job_success` — 2 個頻道，正確建立 2 個 channel_snapshots
    - `test_snapshot_job_idempotent` — 執行兩次，row count 仍為 2（upsert 不重複）
    - `test_snapshot_job_terminated_channel` — channels.list 回傳空，頻道設為 terminated
    - `test_snapshot_job_quota_exceeded` — mock 403 quotaExceeded，job 停止，fetch_log status='failed'
    - `test_snapshot_date_is_taipei_time` — 確認 snapshot_date 使用 UTC+8

  **Must NOT do**:
  - 不要使用 `date.today()`（不考慮時區）
  - 不要在 quotaExceeded 時繼續執行其他頻道

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（與 Tasks 10, 11 並行）
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 18
  - **Blocked By**: Task 8

  **References**:
  - `spec.md:219-224` — 排程規劃（頻道快照任務）
  - `spec.md:273-281` — 異常處理策略
  - `spec.md:230-244` — channels.list 欄位對照

  **Acceptance Criteria**:
  - [ ] `pytest tests/test_collector_channel_snapshot.py -v` — 6 個測試全通過
  - [ ] 執行 job 兩次後 `channel_snapshots` row count 不增加（idempotent）
  - [ ] QuotaExceededException 後 fetch_logs 有 `status='failed'` 記錄

  **QA Scenarios**:

  ```
  Scenario: 快照 Job 冪等性驗證
    Tool: Bash (pytest)
    Steps:
      1. pytest tests/test_collector_channel_snapshot.py::test_snapshot_job_idempotent -v
    Expected Result: PASS — 執行兩次，channel_snapshots row count = 頻道數（不是 2x）
    Evidence: .sisyphus/evidence/task-9-idempotent.txt

  Scenario: 頻道消失自動標記
    Tool: Bash (pytest)
    Steps:
      1. pytest tests/test_collector_channel_snapshot.py::test_snapshot_job_terminated_channel -v
    Expected Result: PASS — channels.list 空回應 → 頻道 status = 'terminated'
    Evidence: .sisyphus/evidence/task-9-terminated.txt
  ```

  **Commit**: YES
  - Message: `feat: implement channel snapshot collector job`
  - Files: `backend/src/youtube_monitor/collector/jobs/channel_snapshot.py`, `backend/tests/test_collector_channel_snapshot.py`

- [x] 11. Collector Job — 影片發現（每日 06:00）

  **What to do**:
  - 實作 `backend/src/youtube_monitor/collector/jobs/discover_videos.py`
  - 實作 `run_discover_videos_job(session, youtube_client)` 函數：
    ```
    流程（每個 active 頻道）：
    1. 取得頻道的 uploads playlist ID（從 channels.contentDetails.relatedPlaylists.uploads）
    2. 呼叫 youtube_client.get_uploads_playlist_items(playlist_id, max_pages=4)
       → 取得最多 200 個影片 ID
    3. 過濾出 DB 中尚未存在的影片 ID（新影片）
    4. 批次呼叫 youtube_client.get_video_details(new_video_ids)
    5. 寫入 videos 表（Upsert on youtube_video_id）
    6. 建立 rapid_tracking_until = 今日 + 7 days（存在 videos.rapid_tracking_until 欄位）
    7. 記錄 fetch_logs
    ```
  - 注意：`uploads playlist ID` 需要先從 `channels.list(part=contentDetails)` 取得
    - 若 DB 的 channels 表已有 uploads_playlist_id（需要加這個欄位），直接使用
    - 若無，先呼叫 channels.list 取得（消耗 1 unit/batch-50）
  - **加入 `uploads_playlist_id` 欄位到 `Channel` model** 並產生新 migration
  - 若頻道的 `uploadsPlaylistId` 為 null，跳過該頻道並記錄警告
  - 若頻道已有 0 影片（playlist 回傳空），優雅處理（不是錯誤）
  - 撰寫 `backend/tests/test_collector_discover_videos.py`：
    - `test_discover_new_videos` — mock 10 個新影片，全部寫入 videos 表
    - `test_discover_no_new_videos` — 所有影片 ID 已在 DB，不寫入，不呼叫 video_details
    - `test_discover_empty_playlist` — playlist 為空，優雅結束，不拋出錯誤
    - `test_discover_caps_at_200_videos` — mock 250 個影片，確認只處理 200 個
    - `test_rapid_tracking_set` — 新影片的 `rapid_tracking_until` 設為今日+7天

  **Must NOT do**:
  - 不要呼叫 `search.list`（改用 playlistItems.list）
  - 不要 fetch 超過 200 個影片（防止配額暴增）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（與 Tasks 9, 11 並行）
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 18
  - **Blocked By**: Task 8

  **References**:
  - `spec.md:192-203` — 核心爬取策略（避免 search.list 的流程）
  - `spec.md:248-270` — videos.list 欄位對照
  - `spec.md:525-530` — 配額節省技巧（批次查詢、差異更新）

  **Acceptance Criteria**:
  - [ ] `pytest tests/test_collector_discover_videos.py -v` — 5 個測試全通過
  - [ ] 已在 `Channel` model 加入 `uploads_playlist_id` 欄位
  - [ ] 已建立並套用新的 Alembic migration

  **QA Scenarios**:

  ```
  Scenario: 新影片發現並寫入
    Tool: Bash (pytest)
    Steps:
      1. pytest tests/test_collector_discover_videos.py::test_discover_new_videos -v
    Expected Result: PASS — 10 個新影片寫入 videos 表，rapid_tracking_until 設為今日+7天
    Evidence: .sisyphus/evidence/task-10-discover-videos.txt

  Scenario: 超過 200 個影片時截斷
    Tool: Bash (pytest)
    Steps:
      1. pytest tests/test_collector_discover_videos.py::test_discover_caps_at_200_videos -v
    Expected Result: PASS — 只處理 200 個，不超出
    Evidence: .sisyphus/evidence/task-10-cap-200.txt
  ```

  **Commit**: YES
  - Message: `feat: implement video discovery collector job`
  - Files: `backend/src/youtube_monitor/collector/jobs/discover_videos.py`, `backend/tests/test_collector_discover_videos.py`

- [x] 12. Collector Job — 影片統計快照（每日 08:00）

  **What to do**:
  - 實作 `backend/src/youtube_monitor/collector/jobs/video_snapshot.py`
  - 實作 `run_video_snapshot_job(session, youtube_client)` 函數：
    ```
    流程：
    1. 查詢需要更新的影片（status='public' AND NOT deleted/private）
       策略：
       - rapid_tracking_until >= today → 納入（快速追蹤中的新影片）
       - published_at < 30 days ago AND last_snapshot < 7 days ago → 降頻（每週一次）
       - 其他（30 天內非快速追蹤）→ 每日更新
    2. 批次呼叫 youtube_client.get_video_details（每次 50 個）
    3. 若影片回傳 status='private'/'deleted' → 更新 videos.status
    4. Upsert video_snapshots（(video_id, snapshot_date=今日 UTC+8)）
    5. 記錄 fetch_logs（items_fetched = 處理影片數, api_quota_used）
    ```
  - 使用 UTC+8 日期（同 Task 9 的 `get_taipei_date()` helper）
  - 影片消失處理：`videos.list` 不包含某影片 ID → 設 `videos.status='private'` 或 `'deleted'`
  - 撰寫 `backend/tests/test_collector_video_snapshot.py`：
    - `test_video_snapshot_success` — 5 個影片，建立 5 個快照
    - `test_video_snapshot_idempotent` — 執行兩次，video_snapshots row count 不增加
    - `test_video_gone_private` — mock API 回傳 status=private，更新 videos.status
    - `test_video_rapid_tracking_included` — 7 天內的新影片一定包含在快照 job
    - `test_video_downsampling` — 30 天前的影片若已有本週快照，跳過（節省配額）

  **Must NOT do**:
  - 不要對 status='private'/'deleted'/'terminated' 的影片呼叫 API
  - 不要硬刪除影片記錄

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（與 Tasks 9, 10 並行）
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 18
  - **Blocked By**: Task 8

  **References**:
  - `spec.md:219-226` — 排程（影片統計快照 + 新影片密集追蹤）
  - `spec.md:525-531` — 快照降頻策略（發布超過 30 天的影片降為每週）
  - `spec.md:273-281` — 影片消失/私人化處理

  **Acceptance Criteria**:
  - [ ] `pytest tests/test_collector_video_snapshot.py -v` — 5 個測試全通過
  - [ ] 執行兩次後 `video_snapshots` row count 不變（idempotent）
  - [ ] mock 影片私人化 → `videos.status = 'private'`（測試驗證）

  **QA Scenarios**:

  ```
  Scenario: 影片快照冪等性
    Tool: Bash (pytest)
    Steps:
      1. pytest tests/test_collector_video_snapshot.py::test_video_snapshot_idempotent -v
    Expected Result: PASS — 執行兩次 row count = 影片數（不是 2x）
    Evidence: .sisyphus/evidence/task-11-idempotent.txt

  Scenario: 影片消失自動更新
    Tool: Bash (pytest)
    Steps:
      1. pytest tests/test_collector_video_snapshot.py::test_video_gone_private -v
    Expected Result: PASS — videos.status 更新為 'private'
    Evidence: .sisyphus/evidence/task-11-gone-private.txt
  ```

  **Commit**: YES
  - Message: `feat: implement video stats snapshot collector job`
  - Files: `backend/src/youtube_monitor/collector/jobs/video_snapshot.py`, `backend/tests/test_collector_video_snapshot.py`

- [x] 13. React 前端鷹架（Vite + TS + shadcn/ui + TanStack Query + JWT axios interceptor）

  **What to do**:
  - 前提：Task 1 已用 Vite 初始化 `frontend/`
  - 安裝依賴：
    ```bash
    cd frontend
    pnpm install
    pnpm add @tanstack/react-query @tanstack/react-query-devtools
    pnpm add react-router-dom
    pnpm add recharts
    pnpm add -D tailwindcss postcss autoprefixer
    npx tailwindcss init -p
    ```
  - 初始化 shadcn/ui：`pnpm dlx shadcn@latest init`（選 zinc 主題，CSS variables）
  - 安裝基礎 shadcn 元件：`button`, `card`, `table`, `badge`, `input`, `form`, `dialog`, `skeleton`
  - 建立路由結構（`frontend/src/App.tsx`）：
    ```tsx
    import { createBrowserRouter, RouterProvider } from "react-router-dom";
    // Routes:
    // /login → LoginPage（公開，不需 JWT）
    // / → DashboardPage（需登入）
    // /channels → ChannelListPage（需登入）
    // /channels/import → ChannelImportPage（需登入）
    // /channels/:id → ChannelDetailPage（需登入）
    // /videos → VideoListPage（需登入）
    // 未登入時自動 redirect 到 /login
    ```
  - 建立 `frontend/src/lib/api.ts`（API client，axios + JWT interceptor）：
    ```typescript
    import axios from "axios";

    const api = axios.create({ baseURL: "/api" });

    // Request interceptor: 自動帶 Bearer token
    api.interceptors.request.use((config) => {
      const token = localStorage.getItem("access_token");
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    // Response interceptor: 401 自動 redirect 到 /login
    api.interceptors.response.use(
      (r) => r,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }
    );

    export async function login(username: string, password: string) { ... }
    export async function refreshToken(refreshToken: string) { ... }
    export async function fetchChannels(params?: { status?: string; page?: number; limit?: number }) { ... }
    export async function createChannel(data: { youtube_channel_id: string; channel_title: string }) { ... }
    export async function deleteChannel(id: number) { ... }
    export async function fetchSystemQuota() { ... }
    export async function fetchStatsOverview() { ... }
    ```
  - 建立 `frontend/src/providers/AuthProvider.tsx`（管理 JWT 狀態）：
    - 儲存 `access_token`/`refresh_token` 到 `localStorage`
    - 提供 `useAuth()` hook：`{ user, login, logout, isAuthenticated }`
  - 建立 `frontend/src/components/ProtectedRoute.tsx`（包裝需要登入的頁面）
  - 建立 `frontend/src/providers/QueryProvider.tsx`：
    ```tsx
    import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          gcTime: 300_000,  // NOTE: v5 changed cacheTime → gcTime
        },
      },
    });
    ```
  - 建立共用元件骨架：
    - `frontend/src/components/Layout.tsx` — 側邊欄 + 頂部導航
    - `frontend/src/components/EmptyState.tsx` — 統一空狀態元件（`data-testid="empty-state"`）
    - `frontend/src/components/ErrorBanner.tsx` — API 不可達時顯示的錯誤橫幅
    - `frontend/src/components/NumberFormatter.tsx` — `Intl.NumberFormat` 格式化（`1.2M`, `500K`）

  **Must NOT do**:
  - 不要使用 `cacheTime`（已在 TanStack Query v5 廢棄，用 `gcTime`）
  - 不要建立任何 Page 組件（Tasks 14-20 負責）
  - 不要在此加入匯出功能（Phase 2）
  - 不要將 JWT token 儲存在 sessionStorage 以外（localStorage 可接受，cookie 也可，但不要 in-memory only）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 4，可與 Wave 3 的 Tasks 10-12 並行）
  - **Parallel Group**: Wave 4
  - **Blocks**: Tasks 14, 15, 16, 17, 19, 20
  - **Blocked By**: Task 1

  **References**:
  - [shadcn/ui 安裝指南](https://ui.shadcn.com/docs/installation/vite)
  - [TanStack Query v5 gcTime](https://tanstack.com/query/v5/docs/framework/react/guides/caching)
  - [React Router v6 文件](https://reactrouter.com/en/main/start/overview)

  **Acceptance Criteria**:
  - [ ] `pnpm dev` 啟動成功，無編譯錯誤
  - [ ] `http://localhost:5173` 可以看到基本 Layout（側邊欄 + 導航）
  - [ ] `grep -r "cacheTime" frontend/src/` 無輸出（確認使用 gcTime）
  - [ ] `frontend/src/components/EmptyState.tsx` 存在含 `data-testid="empty-state"`

  **QA Scenarios**:

  ```
  Scenario: 前端開發伺服器正常啟動
    Tool: Bash
    Steps:
      1. cd frontend && pnpm build 2>&1 | tail -5 → 應無 ERROR
    Expected Result: Build 成功
    Evidence: .sisyphus/evidence/task-13-build-success.txt

  Scenario: 無 cacheTime（舊 API）
    Tool: Bash
    Steps:
      1. grep -rn "cacheTime" frontend/src/ → 應無輸出
    Expected Result: 無舊 API 使用
    Evidence: .sisyphus/evidence/task-13-no-cachetime.txt
  ```

  **Commit**: YES
  - Message: `feat: scaffold React frontend with shadcn/ui, TanStack Query, and JWT auth client`
  - Files: `frontend/src/`, `frontend/package.json`, `frontend/vite.config.ts`

- [x] 14. Login 頁面（JWT auth flow）

  **What to do**:
  - 實作 `frontend/src/pages/LoginPage.tsx`：
    - `<form>` 含 `username` 和 `password` 欄位（shadcn/ui `<Input>`, `<Button>`）
    - Submit → `POST /api/auth/login`
    - 成功：儲存 `access_token` / `refresh_token` 到 localStorage，redirect 到 `/`
    - 失敗：顯示錯誤訊息（"帳號或密碼錯誤"，不顯示原始 401 techincal message）
    - 帶有 `aria-label="username"` 和 `aria-label="password"` 方便 Playwright 測試
    - Loading 狀態：按下 Submit 後 Button 顯示 "登入中..." 直到回應
  - 確認 `ProtectedRoute.tsx`（Task 13 建立）正確運作：
    - 未登入時存取 `/`、`/channels` 等頁面 → 自動 redirect 到 `/login`
    - 登入後存取 `/login` → redirect 到 `/`

  **Test cases to cover** (Playwright，`frontend/e2e/login.spec.ts`):
  - 正確帳密 → redirect 到 Dashboard
  - 錯誤密碼 → 顯示錯誤訊息，停留在 /login
  - 未登入存取 `/` → redirect 到 `/login`

  **Must NOT do**:
  - 不要顯示原始 HTTP 狀態碼給使用者（只顯示友善中文訊息）
  - 不要在 Login 頁面顯示需登入才能看到的內容

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 4，與 Tasks 13, 15, 16, 17 並行）
  - **Parallel Group**: Wave 4
  - **Blocks**: Tasks 15, 16, 17, 19, 20（所有功能頁面需先確認 auth flow 正常）
  - **Blocked By**: Task 13

  **References**:
  - `frontend/src/lib/api.ts`（Task 13 建立，含 `login()` 函式）
  - `frontend/src/providers/AuthProvider.tsx`（Task 13 建立）
  - `frontend/src/components/ProtectedRoute.tsx`（Task 13 建立）
  - [shadcn/ui Form 元件](https://ui.shadcn.com/docs/components/form)

  **Acceptance Criteria**:
  - [ ] `http://localhost:5173/login` 顯示 Login form（username/password/submit）
  - [ ] 正確帳密登入後 → redirect 到 `http://localhost:5173/`
  - [ ] 錯誤密碼 → 頁面顯示錯誤訊息（不 crash）
  - [ ] `http://localhost:5173/` 未登入時 → redirect 到 `http://localhost:5173/login`

  ```
  Scenario: 正常登入 flow
    Tool: Playwright
    Preconditions: backend 運行中，admin 帳號已建立
    Steps:
      1. page.goto("http://localhost:5173/login")
      2. page.fill('[aria-label="username"]', "admin")
      3. page.fill('[aria-label="password"]', "testpass")
      4. page.click('[type="submit"]')
      5. await page.waitForURL("http://localhost:5173/")
    Expected Result: URL 變更為 "/"，頁面顯示 Dashboard 內容
    Evidence: .sisyphus/evidence/task-14-login-success.png

  Scenario: 錯誤密碼顯示錯誤訊息
    Tool: Playwright
    Steps:
      1. page.goto("http://localhost:5173/login")
      2. page.fill('[aria-label="username"]', "admin")
      3. page.fill('[aria-label="password"]', "wrongpassword")
      4. page.click('[type="submit"]')
      5. await page.waitForSelector('[data-testid="login-error"]')
    Expected Result: 顯示包含 "帳號或密碼錯誤" 的錯誤訊息，URL 仍為 /login
    Evidence: .sisyphus/evidence/task-14-login-error.png

  Scenario: 未登入自動 redirect
    Tool: Playwright
    Steps:
      1. 清除 localStorage（page.evaluate(() => localStorage.clear())）
      2. page.goto("http://localhost:5173/")
      3. await page.waitForURL("**/login")
    Expected Result: 自動 redirect 到 /login
    Evidence: .sisyphus/evidence/task-14-protected-redirect.png
  ```

  **Commit**: YES
  - Message: `feat: add login page with JWT authentication flow`
  - Files: `frontend/src/pages/LoginPage.tsx`, `frontend/e2e/login.spec.ts`

- [x] 15. Dashboard 首頁總覽頁

  **What to do**:
  - 實作 `frontend/src/pages/DashboardPage.tsx`
  - **頂部指標卡片**（4 個 KPI Card）：
    - 監控中頻道數（`GET /api/stats/overview` → `total_channels`）
    - 追蹤影片總數（`total_videos`）
    - 本週新增影片數（`new_videos_this_week`）
    - 今日 API 配額使用量 / 剩餘量（`GET /api/system/quota`）
  - 每個 KPI Card 有 loading skeleton（`data-testid="kpi-card-skeleton"`）
  - **區塊 B — 本週新增影片列表**（表格）：
    - 欄位：縮圖、標題、頻道名、發布時間、觀看數、按讚數
    - 使用 `GET /api/stats/videos/new` 資料
    - `data-testid="new-videos-table"`
  - **區塊 C — 頻道活躍度排行**（前 5 名）：
    - 依本週新發布影片數排序
    - 使用 `GET /api/stats/overview` 中的 `most_active_channels`（若 API 回傳）
  - 大數字格式化：使用 `NumberFormatter` 元件（`1,234,567` → `1.2M`）
  - 若 API 不可達，顯示 `ErrorBanner`

  **Must NOT do**:
  - 不要加入異常事件區塊（Phase 2）
  - 不要在 Recharts 使用動畫（若此頁有圖表，設 `isAnimationActive={false}`）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（與 Tasks 14, 15, 17 並行）
  - **Parallel Group**: Wave 4
  - **Blocks**: — （最終頁面）
  - **Blocked By**: Tasks 5, 7, 12

  **References**:
  - `spec.md:365-395` — Dashboard 首頁設計規格
  - `frontend/src/lib/api.ts`（Task 12 建立）— fetchSystemQuota, fetchStatsOverview
  - `frontend/src/components/EmptyState.tsx`（Task 12 建立）
  - [shadcn/ui Card 元件](https://ui.shadcn.com/docs/components/card)
  - [shadcn/ui Skeleton 元件](https://ui.shadcn.com/docs/components/skeleton)

  **Acceptance Criteria**:
  - [ ] `http://localhost:5173/` 在有資料時顯示 4 個 KPI 卡片
  - [ ] 卡片有 loading skeleton（`data-testid="kpi-card-skeleton"` 在載入時可見）
  - [ ] 大數字正確格式化（`Intl.NumberFormat` 縮寫）
  - [ ] 後端不可達時顯示 ErrorBanner

  **QA Scenarios**:

  ```
  Scenario: KPI 卡片正常顯示
    Tool: Playwright
    Preconditions: backend 服務運行中，至少 1 個頻道已存在
    Steps:
      1. page.goto('http://localhost:5173/')
      2. page.waitForSelector('[data-testid="kpi-card"]', { timeout: 5000 })
      3. expect(page.locator('[data-testid="kpi-card"]').count()).resolves.toBe(4)
    Expected Result: 4 個 KPI 卡片可見
    Evidence: .sisyphus/evidence/task-13-kpi-cards.png

  Scenario: API 不可達顯示 ErrorBanner
    Tool: Playwright
    Preconditions: backend 未運行
    Steps:
      1. page.goto('http://localhost:5173/')
      2. page.waitForSelector('[data-testid="error-banner"]', { timeout: 10000 })
    Expected Result: 錯誤橫幅顯示
    Evidence: .sisyphus/evidence/task-15-error-banner.png
  ```

  **Commit**: YES
  - Message: `feat: implement dashboard overview page`
  - Files: `frontend/src/pages/DashboardPage.tsx`

- [x] 16. 頻道列表頁

  **What to do**:
  - 實作 `frontend/src/pages/ChannelListPage.tsx`
  - **頻道列表表格**（`data-testid="channel-list"`）：
    - 欄位：頭像（縮圖）、頻道名、訂閱數、影片數、狀態 Badge、來源、標籤、最後更新時間
    - 使用 `GET /api/channels?page=1&limit=50` 資料
    - 訂閱數格式化（NumberFormatter：`1.23M`）
    - 狀態 Badge 顏色：`active` → 綠色, `terminated` → 紅色, `paused` → 灰色
  - **篩選器**：
    - `?status=active/paused/terminated` 下拉篩選
    - 點選頻道行跳轉至 `/channels/:id`
  - **新增頻道 Dialog**（`data-testid="add-channel-dialog"`）：
    - 按鈕開啟 Dialog
    - 輸入欄位：YouTube Channel ID 或 URL（`youtube_channel_id`）、頻道名稱（`channel_title`）
    - Submit 後呼叫 `POST /api/channels`
    - 成功後關閉 Dialog，刷新列表（TanStack Query invalidateQueries）
    - 顯示錯誤：若 409，顯示「此頻道已在監控清單中」
  - **空狀態**：無頻道時顯示 `<EmptyState>` 元件（`data-testid="empty-state"`）
  - 撰寫 Playwright 測試 `frontend/tests/e2e/channels.spec.ts`：
    - `test_channel_list_renders` — 列表出現（mock API 回傳 2 個頻道）
    - `test_empty_state_shown` — 無頻道時顯示 empty-state
    - `test_add_channel_form` — 開啟 Dialog、填表、submit 後列表更新
    - `test_duplicate_channel_shows_error` — mock 409 → 顯示錯誤訊息

  **Must NOT do**:
  - 不要實作批次操作（Phase 2）
  - 不要實作匯出按鈕（Phase 2）
  - 不要實作頻道搜尋功能（Phase 2）— Phase 1 只有狀態篩選

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（與 Tasks 13, 15, 17 並行）
  - **Parallel Group**: Wave 4
  - **Blocks**: — （最終頁面）
  - **Blocked By**: Tasks 5, 12

  **References**:
  - `spec.md:386-396` — 頻道列表頁設計規格
  - `frontend/src/lib/api.ts`（Task 12）— fetchChannels, createChannel
  - `frontend/src/components/EmptyState.tsx`（Task 12）
  - [shadcn/ui Table 元件](https://ui.shadcn.com/docs/components/table)
  - [shadcn/ui Dialog 元件](https://ui.shadcn.com/docs/components/dialog)
  - [TanStack Query invalidateQueries](https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations)

  **Acceptance Criteria**:
  - [ ] Playwright `channels.spec.ts` — 4 個測試全通過
  - [ ] 無頻道時 `[data-testid="empty-state"]` 可見
  - [ ] 新增頻道成功後列表自動刷新（無需手動 reload）

  **QA Scenarios**:

  ```
  Scenario: 頻道列表頁正常渲染（含 empty state）
    Tool: Playwright
    Preconditions: 空資料庫狀態
    Steps:
      1. page.goto('http://localhost:5173/channels')
      2. await page.waitForSelector('[data-testid="empty-state"]', { timeout: 3000 })
    Expected Result: empty-state 可見
    Evidence: .sisyphus/evidence/task-16-empty-state.png

  Scenario: 新增頻道流程
    Tool: Playwright
    Steps:
      1. page.goto('http://localhost:5173/channels')
      2. page.click('[data-testid="add-channel-button"]')
      3. page.waitForSelector('[data-testid="add-channel-dialog"]')
      4. page.fill('[name="youtube_channel_id"]', 'UCxxxxxxxxxxxxxxxxxxxxxx')
      5. page.fill('[name="channel_title"]', 'Test Channel')
      6. page.click('[type="submit"]')
      7. page.waitForSelector('[data-testid="channel-list"]')
      8. 確認列表中有 "Test Channel"
    Expected Result: 新頻道出現在列表中，Dialog 關閉
    Evidence: .sisyphus/evidence/task-16-add-channel.png
  ```

  **Commit**: YES
  - Message: `feat: implement channel list page with add channel dialog`
  - Files: `frontend/src/pages/ChannelListPage.tsx`, `frontend/tests/e2e/channels.spec.ts`

- [x] 17. 頻道詳情頁（含趨勢圖）

  **What to do**:
  - 實作 `frontend/src/pages/ChannelDetailPage.tsx`（路由：`/channels/:id`）
  - **頻道資訊卡**：
    - 頭像（thumbnail）、頻道名、說明、建立時間、國家、YouTube 外部連結
    - 訂閱數、影片數、總觀看數（格式化）
    - 狀態 Badge
    - 標籤列表
  - **趨勢圖**（Recharts，**必須設 `isAnimationActive={false}`**）：
    - 訂閱數成長折線圖（`GET /api/stats/channels/:id/trend`）
    - X 軸：日期，Y 軸：訂閱數（縮寫 `1.2M`）
    - `data-testid="subscriber-trend-chart"`
  - **影片列表**（簡化版，只顯示前 20 個）：
    - 欄位：縮圖、標題、發布時間、觀看數、按讚數
    - 使用 `GET /api/channels/:id/videos?limit=20`
    - 每項有連結到 YouTube 外部連結
  - **趨勢圖空狀態**：若無快照資料，顯示「尚無趨勢數據，等待明日第一次快照」

  **Must NOT do**:
  - 不要加入異常記錄區塊（Phase 2）
  - 不要加入影片的刪除功能（影片由 Collector 管理）
  - 不要在 Recharts 使用預設動畫（必須 `isAnimationActive={false}`）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（與 Tasks 15, 16, 19 並行）
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 21
  - **Blocked By**: Tasks 6, 13, 14

  **References**:
  - `spec.md:397-412` — 頻道詳情頁設計規格
  - `frontend/src/lib/api.ts`（Task 13）— fetchChannelDetail, fetchChannelSnapshots
  - [Recharts LineChart 文件](https://recharts.org/en-US/api/LineChart)
  - Metis 分析：Recharts `isAnimationActive={false}` for polled data

  **Acceptance Criteria**:
  - [ ] `/channels/1` 顯示頻道資訊卡（假設 DB 有資料）
  - [ ] `grep -n "isAnimationActive" frontend/src/pages/ChannelDetailPage.tsx` 顯示有 `isAnimationActive={false}`
  - [ ] 無快照資料時顯示趨勢圖空狀態訊息

  **QA Scenarios**:

  ```
  Scenario: 頻道詳情頁渲染
    Tool: Playwright
    Preconditions: DB 有 1 個頻道（id=1）
    Steps:
      1. page.goto('http://localhost:5173/channels/1')
      2. page.waitForSelector('[data-testid="channel-info-card"]', { timeout: 3000 })
      3. page.waitForSelector('[data-testid="subscriber-trend-chart"]')
    Expected Result: 頻道資訊和趨勢圖區塊可見
    Evidence: .sisyphus/evidence/task-17-channel-detail.png

  Scenario: 無動畫設定（Recharts）
    Tool: Bash
    Steps:
      1. grep -n "isAnimationActive" frontend/src/pages/ChannelDetailPage.tsx
    Expected Result: 至少一行顯示 isAnimationActive={false}
    Evidence: .sisyphus/evidence/task-17-no-animation.txt
  ```

  **Commit**: YES
  - Message: `feat: implement channel detail page with trend charts`
  - Files: `frontend/src/pages/ChannelDetailPage.tsx`

- [x] 18. APScheduler 整合（FastAPI lifespan）

  **What to do**:
  - 實作 `backend/src/youtube_monitor/collector/scheduler.py`：
    ```python
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger
    from youtube_monitor.collector.jobs.channel_snapshot import run_channel_snapshot_job
    from youtube_monitor.collector.jobs.discover_videos import run_discover_videos_job
    from youtube_monitor.collector.jobs.video_snapshot import run_video_snapshot_job

    def create_scheduler(session_factory, youtube_client) -> AsyncIOScheduler:
        scheduler = AsyncIOScheduler(timezone="Asia/Taipei")

        # max_instances=1 is MANDATORY: prevents job overlap if previous run not finished
        scheduler.add_job(
            run_channel_snapshot_job,
            CronTrigger(hour=4, minute=0, timezone="Asia/Taipei"),
            id="channel_snapshot",
            max_instances=1,  # DO NOT REMOVE: prevents concurrent execution
            misfire_grace_time=3600,  # 1 hour grace period
            kwargs={"session_factory": session_factory, "youtube_client": youtube_client},
        )
        scheduler.add_job(
            run_discover_videos_job,
            CronTrigger(hour=6, minute=0, timezone="Asia/Taipei"),
            id="discover_videos",
            max_instances=1,
            misfire_grace_time=3600,
            kwargs={...},
        )
        scheduler.add_job(
            run_video_snapshot_job,
            CronTrigger(hour=8, minute=0, timezone="Asia/Taipei"),
            id="video_snapshot",
            max_instances=1,
            misfire_grace_time=3600,
            kwargs={...},
        )
        # WAL checkpoint to prevent unbounded WAL file growth
        scheduler.add_job(
            run_wal_checkpoint,
            CronTrigger(minute=0),  # every hour
            id="wal_checkpoint",
            max_instances=1,
        )

        return scheduler
    ```
  - 實作 WAL checkpoint job：
    ```python
    async def run_wal_checkpoint(session_factory):
        async with session_factory() as session:
            await session.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
    ```
  - 更新 `backend/src/youtube_monitor/main.py` 加入 lifespan（**不要用 `app.on_event`，已棄用**）：
    ```python
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Validate YouTube API key at startup
        if not settings.youtube_api_key:
            raise RuntimeError("YOUTUBE_API_KEY environment variable is not set. Cannot start.")

        # Auto-run Alembic migrations
        await run_migrations()

        # Start scheduler
        scheduler = create_scheduler(AsyncSessionLocal, youtube_client)
        scheduler.start()

        yield  # App running

        # Shutdown
        scheduler.shutdown(wait=False)
    ```
  - 實作 `run_migrations()` 函數（在啟動時自動跑 `alembic upgrade head`）：
    ```python
    from alembic.config import Config
    from alembic import command

    async def run_migrations():
        """Run Alembic migrations on startup."""
        loop = asyncio.get_event_loop()
        alembic_cfg = Config("alembic.ini")
        await loop.run_in_executor(None, lambda: command.upgrade(alembic_cfg, "head"))
    ```
  - 更新 `POST /api/system/fetch/trigger` 端點，使其呼叫 `scheduler.modify_job` 立即觸發三個 job
  - 撰寫 `backend/tests/test_scheduler.py`：
    - `test_scheduler_creates_jobs` — 確認 4 個 job 已註冊（channel_snapshot, discover_videos, video_snapshot, wal_checkpoint）
    - `test_scheduler_job_max_instances` — 確認每個 job 的 max_instances=1

  **Must NOT do**:
  - 不要使用 `app.on_event("startup")`（已棄用）
  - 不要設定 `max_instances > 1`（會破壞 SQLite + APScheduler 組合）
  - 不要省略 WAL checkpoint job

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 5）
  - **Parallel Group**: Wave 5（與 Tasks 19, 20）
  - **Blocks**: Task 21
  - **Blocked By**: Tasks 8, 10, 11, 12

  **References**:
  - [APScheduler 3.x AsyncIOScheduler 文件](https://apscheduler.readthedocs.io/en/stable/modules/schedulers/asyncio.html)
  - [FastAPI lifespan 文件](https://fastapi.tiangolo.com/advanced/events/)
  - [Alembic programmatic API](https://alembic.sqlalchemy.org/en/latest/api/commands.html)
  - Metis 分析：lifespan 必須，不能用 on_event；WAL checkpoint 必要

  **Acceptance Criteria**:
  - [ ] `pytest tests/test_scheduler.py -v` — 通過
  - [ ] 服務啟動時若無 `YOUTUBE_API_KEY` 則明確報錯（不靜默失敗）
  - [ ] `docker compose up` 後 backend 健康檢查通過（Alembic migration 自動執行）

  **QA Scenarios**:

  ```
  Scenario: 無 API Key 時啟動報錯
    Tool: Bash
    Steps:
      1. YOUTUBE_API_KEY="" uvicorn youtube_monitor.main:app --port 8001 2>&1 | head -5
    Expected Result: 包含 "YOUTUBE_API_KEY environment variable is not set" 的錯誤訊息，服務不啟動
    Evidence: .sisyphus/evidence/task-18-no-api-key.txt

  Scenario: Scheduler job 數量確認
    Tool: Bash (pytest)
    Steps:
      1. pytest tests/test_scheduler.py::test_scheduler_creates_jobs -v
    Expected Result: PASS — 4 個 job 正確註冊
    Evidence: .sisyphus/evidence/task-18-scheduler-jobs.txt
  ```

  **Commit**: YES
  - Message: `feat: integrate APScheduler with FastAPI lifespan`
  - Files: `backend/src/youtube_monitor/collector/scheduler.py`, 更新 `backend/src/youtube_monitor/main.py`, `backend/tests/test_scheduler.py`

- [x] 19. 影片列表頁

  **What to do**:
  - 實作 `frontend/src/pages/VideoListPage.tsx`（路由：`/videos`）
  - **影片列表表格**（`data-testid="video-list"`）：
    - 欄位：縮圖（小）、標題（截斷超過 50 字）、頻道名、發布時間、觀看數、按讚數、留言數、狀態
    - 使用 `GET /api/videos?page=1&limit=50` 資料
    - 支援 `?channel_id=` 篩選（連結自頻道詳情頁的「查看所有影片」）
    - 觀看數格式化（NumberFormatter）
    - 狀態顯示：`deleted` / `private` 的影片以刪除線或灰色顯示
    - 每個標題有連外 YouTube 連結
  - **空狀態**：無影片時顯示 `<EmptyState>` 元件

  **Must NOT do**:
  - 不要加入影片的 CRUD 操作（影片唯讀）
  - 不要加入匯出功能（Phase 2）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 5，與 Tasks 18, 20）
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 21
  - **Blocked By**: Tasks 7, 13, 14

  **References**:
  - `spec.md:409-409` — 頻道詳情頁影片列表規格（可對照）
  - `frontend/src/lib/api.ts`（Task 13）— fetchVideos
  - `frontend/src/components/EmptyState.tsx`（Task 13）

  **Acceptance Criteria**:
  - [ ] `http://localhost:5173/videos` 可渲染（有或無資料）
  - [ ] 無影片時 `[data-testid="empty-state"]` 可見
  - [ ] 觀看數以縮寫格式顯示（如 `1.2M`）

  **QA Scenarios**:

  ```
  Scenario: 影片列表空狀態
    Tool: Playwright
    Steps:
      1. page.goto('http://localhost:5173/videos')
      2. page.waitForSelector('[data-testid="empty-state"]', { timeout: 3000 })
    Expected Result: empty-state 可見
    Evidence: .sisyphus/evidence/task-19-videos-empty.png
  ```

  **Commit**: YES
  - Message: `feat: implement video list page`
  - Files: `frontend/src/pages/VideoListPage.tsx`

- [x] 20. 批次頻道匯入頁

  **What to do**:
  - 實作 `frontend/src/pages/ChannelImportPage.tsx`（路由：`/channels/import`）
  - **匯入表單**（`data-testid="channel-import-form"`）：
    - multiline `<Textarea>` placeholder：「每行輸入一個 YouTube Channel ID，例如：UCxxxxxx」
    - `data-testid="channel-ids-input"`
    - 「開始匯入」按鈕（`data-testid="import-submit-btn"`），送出後 disabled 直到完成
  - **匯入邏輯**：
    - 解析 textarea 內容，以換行分割，過濾空行與重複項
    - 依序（sequential，非並行）呼叫 `POST /api/channels`（Task 6 的端點），帶 Bearer token
    - 每一行呼叫完成後，**立即**更新該行的結果狀態（inline，不等全部完成）
  - **結果顯示**（`data-testid="import-results"`）：
    - 每行 channel ID 旁顯示狀態 Badge：
      - `pending`（灰色）→ 正在處理中（黃色 spinner）→ 成功（綠色 "已新增"）或失敗（紅色 "失敗: [原因]"）
      - 重複頻道（API 回 409）顯示橙色 "已存在"
    - 進度條或計數器：「處理中：3 / 10」
  - **完成摘要**（`data-testid="import-summary"`）：
    - 全部完成後顯示：「匯入完成：X 個新增，Y 個已存在，Z 個失敗」
    - 「前往頻道列表」按鈕（`Link` to `/channels`）
  - 在 `frontend/src/App.tsx` 加入路由 `/channels/import` → `<ChannelImportPage />`
  - 在頻道列表頁（Task 16）的右上角加入「批次匯入」按鈕，連結至 `/channels/import`

  **Must NOT do**:
  - 不要並行呼叫 `POST /api/channels`（必須依序，避免重複寫入競爭）
  - 不要等所有呼叫完成才顯示結果（必須逐行即時更新）
  - 不要加入 CSV 上傳功能（Phase 2）
  - 不要改動 `POST /api/channels` API 本身（只使用現有端點）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 5，與 Tasks 18, 19）
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 21
  - **Blocked By**: Tasks 6, 13, 14

  **References**:
  - `spec.md` — 批次匯入頁為使用者決策新增功能（multiline textarea，一行一個 channel ID）
  - `frontend/src/pages/ChannelListPage.tsx`（Task 16）— 參考頁面結構 + Bearer token 用法
  - `frontend/src/lib/api.ts`（Task 13）— `createChannel()` API 函數
  - `frontend/src/App.tsx`（Task 13）— 路由新增位置
  - Task 6 規格：`POST /api/channels` 回傳 201（新增）或 409（已存在）或 422（驗證失敗）

  **Acceptance Criteria**:
  - [ ] `/channels/import` 路由可存取（Playwright navigate）
  - [ ] `[data-testid="channel-import-form"]` 可見
  - [ ] 輸入 2 個有效 channel ID，點擊「開始匯入」，`[data-testid="import-summary"]` 最終顯示「2 個新增」
  - [ ] 輸入空行會被跳過（不計入處理次數）
  - [ ] 重複頻道（已存在）顯示橙色 "已存在" badge，不計為失敗

  **QA Scenarios**:

  ```
  Scenario: 批次匯入兩個新頻道（happy path）
    Tool: Playwright
    Preconditions: DB 為空（或確認測試用 channel ID 尚未存在）
    Steps:
      1. page.goto('http://localhost:5173/channels/import')
      2. page.waitForSelector('[data-testid="channel-ids-input"]', { timeout: 3000 })
      3. page.fill('[data-testid="channel-ids-input"]', 'UCabc123\nUCdef456')
      4. page.click('[data-testid="import-submit-btn"]')
      5. page.waitForSelector('[data-testid="import-summary"]', { timeout: 15000 })
      6. page.textContent('[data-testid="import-summary"]') → 包含 "2 個新增"
    Expected Result: 摘要顯示「2 個新增，0 個失敗」
    Failure Indicators: import-summary 未出現，或顯示失敗數 > 0
    Evidence: .sisyphus/evidence/task-20-import-success.png

  Scenario: 重複頻道顯示「已存在」不算失敗
    Tool: Playwright
    Preconditions: DB 中已有 channel UCabc123
    Steps:
      1. page.goto('http://localhost:5173/channels/import')
      2. page.fill('[data-testid="channel-ids-input"]', 'UCabc123')
      3. page.click('[data-testid="import-submit-btn"]')
      4. page.waitForSelector('[data-testid="import-summary"]', { timeout: 10000 })
      5. 確認摘要中失敗數為 0，已存在數為 1
    Expected Result: 摘要顯示「0 個新增，1 個已存在，0 個失敗」；該行 badge 為橙色
    Evidence: .sisyphus/evidence/task-20-import-duplicate.png

  Scenario: 空行被跳過
    Tool: Playwright
    Steps:
      1. page.goto('http://localhost:5173/channels/import')
      2. page.fill('[data-testid="channel-ids-input"]', 'UCabc\n\n\nUCdef')
      3. page.click('[data-testid="import-submit-btn"]')
      4. page.waitForSelector('[data-testid="import-results"]')
      5. count('[data-testid^="import-row-"]') → 應為 2（不含空行）
    Expected Result: 只有 2 列結果，空行不觸發 API 呼叫
    Evidence: .sisyphus/evidence/task-20-import-empty-lines.png
  ```

  **Commit**: YES
  - Message: `feat: implement batch channel import page`
  - Files: `frontend/src/pages/ChannelImportPage.tsx`, 更新 `frontend/src/App.tsx`, 更新 `frontend/src/pages/ChannelListPage.tsx`

- [x] 21. Nginx 配置 + Docker Compose 最終化

  **What to do**:
    - 加入 `backend` 服務完整環境變數
    - 確認 named volume `db-data` 掛載到 `/app/data`
    - 確認 `frontend depends_on: backend: condition: service_healthy`
  - 完善 `nginx/nginx.conf`：
    ```nginx
    server {
        listen 80;
        root /usr/share/nginx/html;
        index index.html;

        # Gzip 壓縮
        gzip on;
        gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

        # API proxy
        location /api/ {
            proxy_pass http://backend:8000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_read_timeout 300s;
        }

        # React SPA routing — CRITICAL: must be present
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
    ```
  - 完善 `backend/Dockerfile`（多階段優化）
  - 完善 `frontend/Dockerfile`（多階段 build）
  - 測試完整 docker compose 流程：
    ```bash
    docker compose build
    docker compose up -d
    sleep 30
    curl -f http://localhost:8000/health
    curl -f http://localhost:3000
    docker compose down
    docker compose up -d  # 重啟確認 volume 持久化
    ```
  - 加入 `.env.example` 完整版

  **Must NOT do**:
  - 不要加入 Redis、Celery 等額外服務
  - 不要移除 `try_files $uri $uri/ /index.html`（React Router 依賴）
  - 不要移除 `--workers 1` 注釋

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（須等 Tasks 3, 18, 19, 20 完成）
  - **Parallel Group**: Sequential
  - **Blocks**: Task 22
  - **Blocked By**: Tasks 3, 18, 19, 20

  **References**:
  - Metis 分析：`try_files` 必須，volume persistence 必須，`depends_on service_healthy` 必須

  **Acceptance Criteria**:
  - [ ] `docker compose up -d` 所有服務健康啟動
  - [ ] `curl http://localhost:8000/health` 回傳 `{"status": "ok"}`
  - [ ] `curl http://localhost:3000` 回傳 HTML
  - [ ] `docker compose down && docker compose up -d` 後資料未丟失

  **QA Scenarios**:

  ```
  Scenario: Docker Compose 從零啟動
    Tool: Bash
    Steps:
      1. docker compose build 2>&1 | tail -3 → 無 ERROR
      2. docker compose up -d
      3. sleep 30
      4. curl -s http://localhost:8000/health | jq .status → 回傳 "ok"
      5. curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 → 回傳 200
    Expected Result: 兩個服務都健康運行
    Evidence: .sisyphus/evidence/task-21-docker-up.txt

  Scenario: Volume 持久化
    Tool: Bash
    Preconditions: 已透過 /api/auth/login 取得 TOKEN，已在 DB 中新增一個頻道
    Steps:
      1. TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"adminpass"}' | jq -r .access_token)
      2. curl -s -X POST http://localhost:8000/api/channels -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"youtube_channel_id":"UCpersist","channel_title":"Persist Test"}' | jq .id → non-null
      3. docker compose down
      4. docker compose up -d && sleep 20
      5. curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/channels | jq '.items | length' → 應 >= 1
    Expected Result: 重啟後資料仍存在（count >= 1）
    Evidence: .sisyphus/evidence/task-21-volume-persistence.txt
  ```

  **Commit**: YES
  - Message: `feat: finalize nginx and Docker Compose for production`
  - Files: `docker-compose.yml`, `nginx/nginx.conf`, `backend/Dockerfile`, `frontend/Dockerfile`

- [x] 22. README + 文件

  **What to do**:
  - 建立 `README.md`，包含：
    - 專案簡介（一段話）
    - 架構圖（文字版 ASCII，照 spec 系統架構圖）
    - **快速開始**：
      ```bash
      cp .env.example .env
      # 填入 YOUTUBE_API_KEY
      docker compose up -d
      # 開啟 http://localhost:3000
      ```
    - **初始化 admin 帳號**：
      ```bash
      # 首次啟動後，在 backend 容器內執行：
      docker compose exec backend python -m youtube_monitor.scripts.create_user \
        --username admin --password <your-password>
      # 或開發環境：
      cd backend && python -m youtube_monitor.scripts.create_user --username admin --password <your-password>
      ```
      說明：系統啟動時不會自動建立預設帳號，必須手動執行此指令；密碼長度至少 8 字元。
    - **開發環境設置**：
      ```bash
      # Backend
      cd backend
      pip install -e ".[dev]"
      alembic upgrade head
      uvicorn youtube_monitor.main:app --reload

      # Frontend
      cd frontend
      pnpm install
      pnpm dev
      ```
    - **執行測試**：
      ```bash
      cd backend && pytest tests/ -v
      cd frontend && pnpm test
      ```
    - **API 文件**：指向 `http://localhost:8000/docs`（FastAPI 自動生成）
    - **重要架構決策**：說明為何使用 `--workers 1`、WAL 模式、`NullPool`（給未來維護者看）
    - **Phase 2 待辦**：列出 spec 中 Phase 2-4 的功能（讓維護者知道方向）

  **Must NOT do**:
  - 不要記錄 API Key
  - 不要包含過度詳細的技術細節（README 是入口，不是完整文件）

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（須等所有功能完成）
  - **Parallel Group**: Sequential
  - **Blocks**: F1-F4
  - **Blocked By**: Task 21

  **References**:
  - `spec.md:1-30` — 專案背景與目標（摘要用）
  - `spec.md:33-58` — 系統架構
  - `spec.md:566-600` — 開發階段規劃（Phase 2-4 用）

  **Acceptance Criteria**:
  - [ ] `README.md` 存在於專案根目錄
  - [ ] `cat README.md | grep "YOUTUBE_API_KEY"` 顯示有提及 API Key 設定方式
  - [ ] `cat README.md | grep "workers 1"` 顯示有說明 workers=1 的原因
  - [ ] `cat README.md | grep "create_user"` 顯示有初始化 admin 帳號的說明

  **QA Scenarios**:

  ```
  Scenario: README 完整性檢查
    Tool: Bash
    Steps:
      1. test -f README.md && echo "EXISTS"
      2. grep -c "docker compose" README.md → 應 >= 1
      3. grep -c "pytest" README.md → 應 >= 1
      4. grep -c "workers 1" README.md → 應 >= 1
      5. grep -c "create_user" README.md → 應 >= 1
    Expected Result: 所有關鍵區塊都存在
    Evidence: .sisyphus/evidence/task-22-readme-check.txt
  ```

  **Commit**: YES
  - Message: `docs: add README with setup and architecture overview`
  - Files: `README.md`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval.**

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search for forbidden patterns. Check evidence files exist.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `mypy backend/` + `ruff check backend/` + `pytest tests/ -v`. Review for: `# type: ignore`, empty excepts, print() in prod, commented-out code. Check AI slop: generic variable names, over-abstraction.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` + `playwright` skill
  Start from `docker compose up`. Execute EVERY QA scenario from EVERY task. Test integration: add channel → trigger collector → see data in Dashboard. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: verify 1:1 between spec and implementation. Check no Phase 2+ features snuck in. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

按任務提交，每個 commit 必須獨立可部署（測試通過）：

```
1.  chore: initialize project structure
2.  feat: add SQLAlchemy models and Alembic async migration (users table included)
3.  chore: add Docker Compose skeleton
4.  feat: configure SQLite async engine with WAL pragmas
5.  feat: implement JWT auth system (users, login, refresh, bearer middleware)
6.  feat: implement channels CRUD API
7.  feat: implement videos and snapshots query API
8.  feat: implement system API with quota 429 guard
9.  feat: implement YouTube API client wrapper
10. feat: implement channel snapshot collector job
11. feat: implement video discovery collector job
12. feat: implement video stats snapshot collector job
13. feat: scaffold React frontend with shadcn/ui and JWT axios interceptor
14. feat: implement login page with JWT auth flow
15. feat: implement dashboard overview page
16. feat: implement channel list page
17. feat: implement channel detail page with trend charts
18. feat: integrate APScheduler with FastAPI lifespan
19. feat: implement video list page
20. feat: implement batch channel import page
21. feat: finalize nginx and Docker Compose for production
22. docs: add README with setup, architecture, and admin init guide
```

---

## Success Criteria

### Verification Commands

```bash
# 0. 取得 JWT Token（後續所有 API 測試均需此步驟）
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<your-admin-password>"}' | jq -r .access_token)
# Expected: TOKEN 為非空字串（約 200+ 字元的 JWT）

# 1. 服務健康檢查（免 JWT）
curl http://localhost:8000/health
# Expected: {"status": "ok"}

# 2. 新增頻道（需 JWT）
curl -s -X POST http://localhost:8000/api/channels \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"youtube_channel_id": "UCxxxxxxx", "channel_title": "Test Channel"}' | jq .id
# Expected: non-null integer

# 3. 重複新增應回傳 409（需 JWT）
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/channels \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"youtube_channel_id": "UCxxxxxxx", "channel_title": "Test Channel"}'
# Expected: 409

# 4. 確認 soft delete（需 JWT）
curl -s -X DELETE http://localhost:8000/api/channels/1 \
  -H "Authorization: Bearer $TOKEN"
sqlite3 app.db "SELECT status FROM channels WHERE id=1"
# Expected: inactive

# 5. 配額追蹤（需 JWT）
curl -s http://localhost:8000/api/system/quota \
  -H "Authorization: Bearer $TOKEN" | jq .used_today
# Expected: number (not null)

# 6. 配額不足時 trigger 應回傳 429（需 JWT，先將 remaining 設低）
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/system/fetch/trigger \
  -H "Authorization: Bearer $TOKEN"
# Expected: 200（配額充足時）或 429（配額不足時）

# 7. 禁止 search.list（靜態掃描，免 JWT）
grep -r "search().list" backend/
# Expected: no output

# 8. 所有測試（免 JWT）
pytest tests/ -v --tb=short
# Expected: all PASS

# 9. Docker volume 持久化（需 JWT）
docker compose down && docker compose up -d
sleep 20
TOKEN2=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<your-admin-password>"}' | jq -r .access_token)
curl -s http://localhost:8000/api/channels \
  -H "Authorization: Bearer $TOKEN2" | jq '.items | length'
# Expected: same count as before restart
```

### Final Checklist
- [ ] All "Must Have" present (WAL, NullPool, upsert, soft delete, etc.)
- [ ] All "Must NOT Have" absent (no search.list, no Phase 2+ features)
- [ ] All tests pass
- [ ] Docker Compose starts cleanly from scratch
- [ ] Dashboard loads and shows data in browser
