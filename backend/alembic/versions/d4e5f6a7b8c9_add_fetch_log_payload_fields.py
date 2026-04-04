"""add fetch_log payload fields

Revision ID: d4e5f6a7b8c9
Revises: c2d3e4f5a6b7
Create Date: 2026-04-04 00:00:00.000000

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("fetch_logs", sa.Column("input_payload", sa.Text(), nullable=True))
    op.add_column("fetch_logs", sa.Column("output_payload", sa.Text(), nullable=True))
    op.add_column("fetch_logs", sa.Column("video_ids", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("fetch_logs") as batch_op:
        batch_op.drop_column("video_ids")
        batch_op.drop_column("output_payload")
        batch_op.drop_column("input_payload")
