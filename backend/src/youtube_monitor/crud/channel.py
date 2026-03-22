from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, text
from sqlalchemy.exc import IntegrityError
from typing import Optional, List, Dict
from youtube_monitor.models.channel import Channel
from youtube_monitor.models.channel_snapshot import ChannelSnapshot
from youtube_monitor.schemas.channel import ChannelCreate, ChannelUpdate

# Allowed sort fields that map to Channel columns directly
_SORT_CHANNEL_COLS = {
    "created_at": Channel.created_at,
    "updated_at": Channel.updated_at,
}

# Allowed sort fields that require joining the latest ChannelSnapshot
_SORT_SNAPSHOT_COLS = {"subscriber_count", "video_count", "view_count"}


async def get_channel(db: AsyncSession, channel_id: int) -> Optional[Channel]:
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    return result.scalar_one_or_none()


async def get_channels(
    db: AsyncSession,
    status: Optional[str] = None,
    source: Optional[str] = None,
    tags: Optional[List[str]] = None,
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> tuple[List[Channel], int]:
    query = select(Channel)
    count_query = select(func.count()).select_from(Channel)

    if status:
        query = query.where(Channel.status == status)
        count_query = count_query.where(Channel.status == status)

    if source:
        query = query.where(Channel.source == source)
        count_query = count_query.where(Channel.source == source)

    if tags:
        # Use json_each() — channel must have AT LEAST ONE of the specified tags (OR logic)
        # Build an EXISTS subquery for each tag, then OR them together
        tag_conditions = [
            Channel.id.in_(
                select(Channel.id).where(
                    text(
                        f"EXISTS (SELECT 1 FROM json_each(channels.tags)"
                        f" WHERE json_each.value = :tag_{i})"
                    ).bindparams(**{f"tag_{i}": tag})
                )
            )
            for i, tag in enumerate(tags)
        ]
        tag_filter = or_(*tag_conditions)
        query = query.where(tag_filter)
        count_query = count_query.where(tag_filter)

    if search:
        search_filter = or_(
            Channel.channel_name.ilike(f"%{search}%"),
            Channel.youtube_channel_id.ilike(f"%{search}%"),
            Channel.custom_url.ilike(f"%{search}%"),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    # Apply sort_by — snapshot-based sorts require a join with latest snapshot
    if sort_by and sort_by in _SORT_SNAPSHOT_COLS:
        latest_date_subq = (
            select(
                ChannelSnapshot.channel_id,
                func.max(ChannelSnapshot.snapshot_date).label("max_date"),
            )
            .group_by(ChannelSnapshot.channel_id)
            .subquery()
        )
        latest_snap_subq = (
            select(
                ChannelSnapshot.channel_id,
                getattr(ChannelSnapshot, sort_by).label("sort_val"),
            )
            .join(
                latest_date_subq,
                (ChannelSnapshot.channel_id == latest_date_subq.c.channel_id)
                & (ChannelSnapshot.snapshot_date == latest_date_subq.c.max_date),
            )
            .subquery()
        )
        query = query.outerjoin(
            latest_snap_subq,
            Channel.id == latest_snap_subq.c.channel_id,
        ).order_by(latest_snap_subq.c.sort_val.desc().nulls_last())
    elif sort_by and sort_by in _SORT_CHANNEL_COLS:
        query = query.order_by(_SORT_CHANNEL_COLS[sort_by].desc())
    else:
        # Default sort: most recently updated first
        query = query.order_by(Channel.updated_at.desc())

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
