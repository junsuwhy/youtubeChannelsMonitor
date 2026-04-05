#!/usr/bin/env python3
"""
找出某個小時應爬但尚未爬的影片快照頻道，並補跑一次。

原理：
  video_snapshot job 在每小時 :30 執行，只處理 schedule_hour == current_hour 的 public 影片。
  若 job 當時沒跑或中途失敗，這些影片今天就不會有 video_snapshot 記錄。
  本腳本查出「今天（台北時間）還沒有 snapshot_date = today 快照」的影片所屬頻道，
  並對每個頻道重新呼叫 run_video_snapshot_job(channel_id=...)。

Usage（容器內 /app，或 backend/ 目錄下啟用 venv）：
  python -m youtube_monitor.management.backfill_video_snapshot --hour 9
  python -m youtube_monitor.management.backfill_video_snapshot --hour 9 --dry-run
  python -m youtube_monitor.management.backfill_video_snapshot --hour 9 --db sqlite+aiosqlite:///./data/app.db
"""
import asyncio
import argparse
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

TAIPEI_TZ = ZoneInfo("Asia/Taipei")


async def find_missing_channels(session: AsyncSession, target_hour: int, taipei_today: str) -> list[tuple[int, str, str]]:
    """
    找出 schedule_hour == target_hour 且有 public 影片，
    但今天（taipei_today）尚未有任何 video_snapshot 的頻道。

    回傳 [(channel_id, youtube_channel_id, channel_name), ...]
    """
    result = await session.execute(
        text("""
            SELECT DISTINCT c.id, c.youtube_channel_id, COALESCE(c.channel_name, '') AS channel_name
            FROM channels c
            JOIN videos v ON v.channel_id = c.id
            WHERE v.status = 'public'
              AND v.schedule_hour = :hour
              AND v.id NOT IN (
                  SELECT vs.video_id
                  FROM video_snapshots vs
                  WHERE vs.snapshot_date = :today
              )
            ORDER BY c.id
        """),
        {"hour": target_hour, "today": taipei_today},
    )
    return result.fetchall()


async def main() -> None:
    parser = argparse.ArgumentParser(description="補跑指定小時的 video_snapshot job")
    parser.add_argument("--hour", type=int, required=True, help="台北時間的小時 (0-23)")
    parser.add_argument("--dry-run", action="store_true", help="只列出頻道，不實際打 API")
    parser.add_argument("--db", default=None, help="覆寫 DATABASE_URL（預設從 config/環境變數讀取）")
    args = parser.parse_args()

    taipei_today = datetime.now(TAIPEI_TZ).date().isoformat()
    print(f"台北今天：{taipei_today}，目標 schedule_hour={args.hour}")

    # ── 載入 config（讀 .env / 環境變數）──────────────────────────
    from youtube_monitor.config import settings

    db_url = args.db or settings.database_url
    api_key = settings.youtube_api_key

    if not api_key and not args.dry_run:
        print("錯誤：YOUTUBE_API_KEY 未設定，請在 .env 或環境變數中設定")
        sys.exit(1)

    # ── 建立 DB session ───────────────────────────────────────────
    engine = create_async_engine(db_url, poolclass=NullPool)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # ── 診斷：找出未補跑的頻道 ────────────────────────────────────
    async with SessionLocal() as session:
        missing = await find_missing_channels(session, args.hour, taipei_today)

    if not missing:
        print(f"✅ 所有 schedule_hour={args.hour} 的頻道今天都已有 video_snapshot，無需補跑")
        await engine.dispose()
        return

    print(f"\n找到 {len(missing)} 個頻道今天尚未有 video_snapshot：")
    for ch_id, yt_id, name in missing:
        print(f"  channel_id={ch_id}  {yt_id}  {name}")

    if args.dry_run:
        print("\n（--dry-run 模式，不實際重跑）")
        await engine.dispose()
        return

    # ── 補跑 ─────────────────────────────────────────────────────
    from youtube_monitor.collector.jobs.video_snapshot import run_video_snapshot_job
    from youtube_monitor.collector.youtube_client import YouTubeClient

    youtube_client = YouTubeClient(api_key)
    print()
    for ch_id, yt_id, name in missing:
        print(f"▶ 補跑 channel_id={ch_id} ({name}) ...")
        async with SessionLocal() as session:
            result = await run_video_snapshot_job(
                session=session,
                youtube_client=youtube_client,
                channel_id=ch_id,
            )
        status = result.get("status", "?")
        videos = result.get("videos_processed", 0)
        units = result.get("api_units_used", 0)
        err = result.get("error", "")
        print(f"   {status}  videos={videos}  units={units}" + (f"  error={err}" if err else ""))

    await engine.dispose()
    print("\n✅ 補跑完成")


if __name__ == "__main__":
    asyncio.run(main())
