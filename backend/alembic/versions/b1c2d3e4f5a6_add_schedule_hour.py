"""add schedule_hour to channels and videos

Revision ID: b1c2d3e4f5a6
Revises: 8114b8dc598c
Create Date: 2026-04-03 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "8114b8dc598c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("channels", sa.Column("schedule_hour", sa.Integer(), nullable=False, server_default="6"))
    op.add_column("videos", sa.Column("schedule_hour", sa.Integer(), nullable=False, server_default="8"))

    # Backfill channels: use (hour of latest video published_at + 1) % 24
    op.execute("""
        UPDATE channels
        SET schedule_hour = (
            SELECT (CAST(strftime('%H', MAX(v.published_at)) AS INTEGER) + 1) % 24
            FROM videos v
            WHERE v.channel_id = channels.id
        )
        WHERE EXISTS (SELECT 1 FROM videos v WHERE v.channel_id = channels.id)
    """)

    # Backfill videos: use hour of published_at directly
    op.execute("""
        UPDATE videos
        SET schedule_hour = CAST(strftime('%H', published_at) AS INTEGER) % 24
        WHERE published_at IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_column("videos", "schedule_hour")
    op.drop_column("channels", "schedule_hour")
