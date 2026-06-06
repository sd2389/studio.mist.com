"""scene metadata fields (sku, category, note)

Revision ID: b2d3e4f5a6c7
Revises: a1c2e3d4f5b6
Create Date: 2026-06-06 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2d3e4f5a6c7"
down_revision: Union[str, Sequence[str], None] = "a1c2e3d4f5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scenes", sa.Column("sku", sa.String(length=128), nullable=True))
    op.add_column("scenes", sa.Column("category", sa.String(length=128), nullable=True))
    op.add_column("scenes", sa.Column("note", sa.Text(), nullable=True))
    op.create_index("ix_scenes_sku", "scenes", ["sku"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_scenes_sku", table_name="scenes")
    op.drop_column("scenes", "note")
    op.drop_column("scenes", "category")
    op.drop_column("scenes", "sku")
