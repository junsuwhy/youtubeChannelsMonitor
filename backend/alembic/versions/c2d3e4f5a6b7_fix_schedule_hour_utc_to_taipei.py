"""fix schedule_hour UTC to Taipei time

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-04-03 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # videos: 把 UTC 小時轉成台北時間（+8，mod 24）
    op.execute("""
        UPDATE videos
        SET schedule_hour = (CAST(strftime('%H', published_at) AS INTEGER) + 8) % 24
        WHERE published_at IS NOT NULL
    """)

    # channels: 同樣 +8
    op.execute("""
        UPDATE channels
        SET schedule_hour = (
            SELECT ((CAST(strftime('%H', MAX(v.published_at)) AS INTEGER) + 8 + 1) % 24)
            FROM videos v WHERE v.channel_id = channels.id
        )
        WHERE EXISTS (SELECT 1 FROM videos v WHERE v.channel_id = channels.id)
    """)


def downgrade() -> None:
    # 還原成 UTC 小時（-8，mod 24）
    op.execute("""
        UPDATE videos
        SET schedule_hour = (CAST(strftime('%H', published_at) AS INTEGER)) % 24
        WHERE published_at IS NOT NULL
    """)

    op.execute("""
        UPDATE channels
        SET schedule_hour = (
            SELECT ((CAST(strftime('%H', MAX(v.published_at)) AS INTEGER) + 1) % 24)
            FROM videos v WHERE v.channel_id = channels.id
        )
        WHERE EXISTS (SELECT 1 FROM videos v WHERE v.channel_id = channels.id)
    """)
