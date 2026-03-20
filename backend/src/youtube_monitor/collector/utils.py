from datetime import datetime, timezone, timedelta, date


def get_taipei_date() -> date:
    """Return today's date in UTC+8 (Asia/Taipei)."""
    taipei_tz = timezone(timedelta(hours=8))
    return datetime.now(taipei_tz).date()
