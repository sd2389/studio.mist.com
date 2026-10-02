"""render job lease

Revision ID: f13380ac830a
Revises: i9j0k1l2m3n4
Create Date: 2026-10-02 17:31:45.000000

Jobs already running were claimed without a lease. They get one that ran out
at their last update, so the next claim retries them (or fails them, when out
of attempts) instead of leaving them stuck in 'running'.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f13380ac830a'
down_revision: Union[str, Sequence[str], None] = 'i9j0k1l2m3n4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('render_jobs', sa.Column('lease_expires_at', sa.DateTime(), nullable=True))
    op.execute("UPDATE render_jobs SET lease_expires_at = updated_at WHERE status = 'running'")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('render_jobs', 'lease_expires_at')
