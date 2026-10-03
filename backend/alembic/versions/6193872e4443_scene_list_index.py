"""scene list index

Revision ID: 6193872e4443
Revises: 81a7e50047d5
Create Date: 2026-10-03 01:10:00.000000

GET /scenes reads one page of a user's scenes, newest first.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '6193872e4443'
down_revision: Union[str, Sequence[str], None] = '81a7e50047d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index('ix_scenes_user_id_updated_at', 'scenes', ['user_id', 'updated_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_scenes_user_id_updated_at', table_name='scenes')
