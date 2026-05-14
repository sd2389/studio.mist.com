"""add scene model config fields

Revision ID: 4f2ab6d72b31
Revises: 93b7d8550ec4
Create Date: 2026-05-13 23:35:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4f2ab6d72b31"
down_revision: Union[str, Sequence[str], None] = "93b7d8550ec4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scenes",
        sa.Column("model_config", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.add_column(
        "scenes",
        sa.Column("slot_selections", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.add_column(
        "scenes",
        sa.Column("scene_settings", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )


def downgrade() -> None:
    op.drop_column("scenes", "scene_settings")
    op.drop_column("scenes", "slot_selections")
    op.drop_column("scenes", "model_config")
