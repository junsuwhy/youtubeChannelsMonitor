FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml .
COPY src/ src/
# Install in non-editable mode for production Docker image
RUN pip install --no-cache-dir .
COPY alembic/ alembic/
COPY alembic.ini .
RUN mkdir -p /app/data

# IMPORTANT: --workers 1 is MANDATORY
# SQLite + APScheduler requires single process to prevent job duplication
# and avoid "database is locked" errors. DO NOT change this.
CMD ["uvicorn", "youtube_monitor.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
