"""allowance generation: refunds give back plan credits only until an allowance replaces them

Revision ID: 351e0e870d0a
Revises: 270d79dd4b52
Create Date: 2026-10-06 21:30:00.000000

A refund decided whether to give back a hold's plan credits by comparing billing periods, which
over-refunded in two ways: customer.subscription.updated can move the period before invoice.paid
grants it, so a hold made in between recorded the new period while spending the old credits,
and its refund after the grant added them on top of the new allowance; and reset_allotments (an
admin's reset, and Free's monthly one) never moves the period, so a hold from before it did the
same.

user_billing.allowance_generation counts each time an allowance replaces the plan credits: a
grant that matches, and every reset. render_jobs.billing_allowance_generation and
ingest_items.credits_allowance_generation keep the count a hold was made at; its refund gives
back the plan part only while the account's count is the same, and the bought part always. The
period columns stay, for the record.

Every existing row gets 0, every account's starting count, so a hold still open when this runs
refunds its plan part until the next grant or reset. Nothing records whether one came between
such a hold and now, so this reading gives credits back rather than taking them. Downgrading
drops the columns.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '351e0e870d0a'
down_revision: Union[str, Sequence[str], None] = '270d79dd4b52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Each table and its new column.
_COLUMNS = (
    ('user_billing', 'allowance_generation'),
    ('render_jobs', 'billing_allowance_generation'),
    ('ingest_items', 'credits_allowance_generation'),
)


def upgrade() -> None:
    """Upgrade schema."""
    for table, column in _COLUMNS:
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column(column, sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    """Downgrade schema."""
    for table, column in reversed(_COLUMNS):
        with op.batch_alter_table(table) as batch:
            batch.drop_column(column)
