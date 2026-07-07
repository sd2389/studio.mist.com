"""backfill render credits balance for pre-existing users

Revision ID: 10073833a3ae
Revises: adbfdff28fc9
Create Date: 2026-07-07 00:00:00.000000

The render_credits_balance column (added in 2257b6e54264) defaulted to 0 and
was only ever set by _apply_allotment on subscription events — rows that
existed before the column landed never received their plan allotment and
would stay at 0 forever. Backfill per plan tier using the values from
app/features/billing/plans.py (free=25, grow=300, studio=1500). Tier matching
mirrors normalize_tier (lower + trim, unknown/NULL falls back to free).
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '10073833a3ae'
down_revision: Union[str, Sequence[str], None] = 'adbfdff28fc9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE user_billing
        SET render_credits_balance = CASE LOWER(TRIM(COALESCE(plan_tier, 'free')))
            WHEN 'grow' THEN 300
            WHEN 'studio' THEN 1500
            ELSE 25
        END
        WHERE render_credits_balance = 0
        """
    )


def downgrade() -> None:
    # Data migration — downgrade is a no-op (cannot distinguish backfilled
    # balances from organically earned ones).
    pass
