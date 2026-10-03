"""rate limit counters

Revision ID: f7e94879f642
Revises: 220347ac191f
Create Date: 2026-10-03 02:00:00.000000

Rate limits were counted in each API process's memory, so every process
had a budget of its own. One row per key and fixed window, counted with
INSERT ... ON CONFLICT ... DO UPDATE, gives every process the same one.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f7e94879f642'
down_revision: Union[str, Sequence[str], None] = '220347ac191f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'rate_limit_counters',
        sa.Column('key', sa.String(length=255), nullable=False),
        sa.Column('window_start', sa.DateTime(), nullable=False),
        sa.Column('count', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('key', 'window_start'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('rate_limit_counters')
