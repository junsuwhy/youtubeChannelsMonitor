import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from youtube_monitor.api.anomalies import router as anomaly_router
from youtube_monitor.api.auth import router as auth_router
from youtube_monitor.api.channels import router as channels_router
from youtube_monitor.api.stats import router as stats_router
from youtube_monitor.api.system import router as system_router
from youtube_monitor.api.videos import router as videos_router
from youtube_monitor.config import settings
from youtube_monitor.database import AsyncSessionLocal


async def run_migrations():
    """Run alembic upgrade head on startup."""
    from alembic.config import Config
    from alembic import command

    loop = asyncio.get_event_loop()
    alembic_cfg = Config("alembic.ini")
    await loop.run_in_executor(None, lambda: command.upgrade(alembic_cfg, "head"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate YouTube API key
    if not settings.youtube_api_key:
        raise RuntimeError(
            "YOUTUBE_API_KEY environment variable is not set. Cannot start."
        )

    # Run migrations
    await run_migrations()

    # Start scheduler
    from youtube_monitor.collector.scheduler import create_scheduler
    from youtube_monitor.collector.youtube_client import YouTubeClient

    youtube_client = YouTubeClient(api_key=settings.youtube_api_key)
    scheduler = create_scheduler(AsyncSessionLocal, youtube_client)
    scheduler.start()

    yield

    scheduler.shutdown(wait=False)


app = FastAPI(title="YouTube Monitor API", lifespan=lifespan)
app.include_router(auth_router, prefix="/api")
app.include_router(channels_router, prefix="/api")
app.include_router(videos_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
app.include_router(system_router, prefix="/api")
app.include_router(anomaly_router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
