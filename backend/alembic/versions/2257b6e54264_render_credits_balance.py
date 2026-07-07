"""render credits balance

Revision ID: 2257b6e54264
Revises: g7h8i9j0k1l2
Create Date: 2026-07-07 03:01:18.035789

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '2257b6e54264'
down_revision: Union[str, Sequence[str], None] = 'h8i9j0k1l2m3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add render_credits_balance column to user_billing."""
    op.add_column(
        'user_billing',
        sa.Column('render_credits_balance', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    """Remove render_credits_balance column from user_billing."""
    op.drop_column('user_billing', 'render_credits_balance')
