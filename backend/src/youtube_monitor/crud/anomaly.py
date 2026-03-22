from typing import Any, Optional

from youtube_monitor.models.anomaly_event import AnomalyEvent


def _sqlalchemy_symbols() -> tuple[Any, Any]:
    sqlalchemy = __import__("sqlalchemy")
    return sqlalchemy.select, sqlalchemy.func


async def create_anomaly_events(db: Any, events: list[dict]) -> list[AnomalyEvent]:
    objs = [AnomalyEvent(**event) for event in events]
    db.add_all(objs)
    await db.flush()
    return objs


async def get_channel_anomalies(
    db: Any,
    channel_id: int,
    event_type: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[AnomalyEvent], int]:
    select, func = _sqlalchemy_symbols()
    query = select(AnomalyEvent).where(AnomalyEvent.channel_id == channel_id)
    count_query = (
        select(func.count())
        .select_from(AnomalyEvent)
        .where(AnomalyEvent.channel_id == channel_id)
    )

    if event_type:
        query = query.where(AnomalyEvent.event_type == event_type)
        count_query = count_query.where(AnomalyEvent.event_type == event_type)

    query = query.order_by(AnomalyEvent.detected_at.desc())
    query = query.offset((page - 1) * limit).limit(limit)

    result = await db.execute(query)
    count_result = await db.execute(count_query)

    items = list(result.scalars().all())
    total = count_result.scalar() or 0

    return items, total
