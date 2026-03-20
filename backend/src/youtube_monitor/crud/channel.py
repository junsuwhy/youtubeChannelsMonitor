from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from typing import Optional, List, Dict
from youtube_monitor.models.channel import Channel
from youtube_monitor.models.channel_snapshot import ChannelSnapshot
from youtube_monitor.schemas.channel import ChannelCreate, ChannelUpdate


async def get_channel(db: AsyncSession, channel_id: int) -> Optional[Channel]:
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    return result.scalar_one_or_none()


async def get_channels(
    db: AsyncSession,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> tuple[List[Channel], int]:
    query = select(Channel)
    count_query = select(func.count()).select_from(Channel)

    if status:
        query = query.where(Channel.status == status)
        count_query = count_query.where(Channel.status == status)

    # Total count
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Paginated results
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    channels = result.scalars().all()

    return list(channels), total


async def create_channel(db: AsyncSession, data: ChannelCreate) -> Channel:
    channel = Channel(
        youtube_channel_id=data.youtube_channel_id,
        channel_name=data.channel_name,
        tags=data.tags,
        source=data.source,
        status="active",
    )
    db.add(channel)
    try:
        await db.commit()
        await db.refresh(channel)
        return channel
    except IntegrityError:
        await db.rollback()
        raise


async def update_channel(
    db: AsyncSession, channel: Channel, data: ChannelUpdate
) -> Channel:
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(channel, field, value)
    await db.commit()
    await db.refresh(channel)
    return channel


async def soft_delete_channel(db: AsyncSession, channel: Channel) -> Channel:
    channel.status = "inactive"
    await db.commit()
    await db.refresh(channel)
    return channel


async def get_latest_snapshot_stats(
    db: AsyncSession, channel_ids: List[int]
) -> Dict[int, dict]:
    if not channel_ids:
        return {}
    latest_date_subq = (
        select(
            ChannelSnapshot.channel_id,
            func.max(ChannelSnapshot.snapshot_date).label("max_date"),
        )
        .where(ChannelSnapshot.channel_id.in_(channel_ids))
        .group_by(ChannelSnapshot.channel_id)
        .subquery()
    )
    result = await db.execute(
        select(ChannelSnapshot).join(
            latest_date_subq,
            (ChannelSnapshot.channel_id == latest_date_subq.c.channel_id)
            & (ChannelSnapshot.snapshot_date == latest_date_subq.c.max_date),
        )
    )
    return {
        row.channel_id: {
            "subscriber_count": row.subscriber_count,
            "video_count": row.video_count,
            "total_view_count": row.view_count,
        }
        for row in result.scalars().all()
    }
