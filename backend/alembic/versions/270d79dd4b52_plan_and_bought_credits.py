"""plan and bought credits: top-ups kept apart from the plan's credits, a period's allowance granted once

Revision ID: 270d79dd4b52
Revises: 09b522567b3b
Create Date: 2026-10-06 18:00:00.000000

A reset or plan change used to overwrite every balance with the plan's allowance, so top-ups a
customer had not spent were lost at each renewal, upgrade and cancellation. Model, AI image and
render credits now each keep their bought credits apart (app/features/billing/credit_pools.py):
user_billing.bought_* is how many of the balance were bought, render_jobs.bought_credits and
ingest_items.bought_*_held how many of a hold's credits came from bought ones (a refund gives
those back as bought), and user_billing.allowance_granted_for the allowance last granted, so a
period's allowance is granted once.

The backfill is in the customer's favour; where the data leaves room for doubt it takes the
reading that never takes a credit away:

- Bought credits = min(balance, the top-ups of that kind in credit_purchases bought since the
  account's current period began). Spending since then counts against the plan's credits first,
  as it does from now on, so bought credits are the last to have gone.
- An account with no period stored counts every top-up in credit_purchases: Free accounts, and
  paid ones whose period the webhook never recorded (until #49 it stored none). Nothing says when
  their balance was last reset, and counting them all can only keep more.
- A top-up recorded at the very start of the period counts.
- Top-ups bought before credit_purchases existed (#29) are not in it, so they count as plan
  credits; scripts/reset_free_ai_credits finds AI ones in Stripe for the Free accounts it lowers.
- Render, custom material and custom asset credits have had no top-ups: nothing is bought.
- Holds still open in the current period (designs holding credits, render jobs held) are spends
  since it began. The bought credits spent since then are put on them first, designs then jobs,
  newest first, up to what each holds, so refunding one gives them back as bought credits rather
  than as plan credits the next reset would replace. Holds from an earlier period keep none: as
  before, their refund adds nothing.
- allowance_granted_for is 'free' for accounts on Free without a subscription, and NULL for the
  others, so the first paid checkout or invoice.paid after this grants its period's allowance as
  it always has (a renewal half processed when this runs is still granted, never skipped).

Downgrading drops the columns. Balances keep their totals; which credits were bought is lost.
"""
from collections import defaultdict
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '270d79dd4b52'
down_revision: Union[str, Sequence[str], None] = '09b522567b3b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The kinds that can be bought: the top-up kind, its balance and its bought column.
_KINDS = (
    ('model', 'model_credits_balance', 'bought_model_credits'),
    ('ai', 'ai_image_credits_balance', 'bought_ai_image_credits'),
    ('render', 'render_credits_balance', 'bought_render_credits'),
)
_PAID_TIERS = ('grow', 'studio')

_billing = sa.table(
    'user_billing',
    sa.column('id', sa.Integer),
    sa.column('user_id', sa.Integer),
    sa.column('plan_tier', sa.String),
    sa.column('stripe_subscription_id', sa.String),
    sa.column('period_start', sa.DateTime),
    sa.column('allowance_granted_for', sa.String),
    *(sa.column(name, sa.Integer) for _, balance, bought in _KINDS for name in (balance, bought)),
)
_purchases = sa.table(
    'credit_purchases',
    sa.column('user_id', sa.Integer),
    sa.column('kind', sa.String),
    sa.column('credits', sa.Integer),
    sa.column('created_at', sa.DateTime),
)
_jobs = sa.table(
    'render_jobs',
    sa.column('id', sa.Integer),
    sa.column('user_id', sa.Integer),
    sa.column('credits', sa.Integer),
    sa.column('credit_state', sa.String),
    sa.column('billing_period_start', sa.DateTime),
    sa.column('bought_credits', sa.Integer),
)
_items = sa.table(
    'ingest_items',
    sa.column('id', sa.Integer),
    sa.column('user_id', sa.Integer),
    sa.column('model_credit_held', sa.Integer),
    sa.column('render_credits_held', sa.Integer),
    sa.column('credits_period_start', sa.DateTime),
    sa.column('bought_model_credit_held', sa.Integer),
    sa.column('bought_render_credits_held', sa.Integer),
)


def _add_columns() -> None:
    with op.batch_alter_table('user_billing') as batch:
        for _, _, bought in _KINDS:
            batch.add_column(sa.Column(bought, sa.Integer(), nullable=False, server_default='0'))
        batch.add_column(sa.Column('allowance_granted_for', sa.String(length=320), nullable=True))
    with op.batch_alter_table('render_jobs') as batch:
        batch.add_column(sa.Column('bought_credits', sa.Integer(), nullable=False, server_default='0'))
    with op.batch_alter_table('ingest_items') as batch:
        batch.add_column(sa.Column('bought_model_credit_held', sa.SmallInteger(), nullable=False, server_default='0'))
        batch.add_column(sa.Column('bought_render_credits_held', sa.Integer(), nullable=False, server_default='0'))


def _purchases_by_user(bind) -> dict:
    """user id -> [(kind, credits, created_at)]"""
    bought = defaultdict(list)
    rows = bind.execute(sa.select(_purchases.c.user_id, _purchases.c.kind, _purchases.c.credits, _purchases.c.created_at))
    for user_id, kind, credits, created_at in rows:
        bought[user_id].append((kind, credits or 0, created_at))
    return bought


def _open_holds(bind) -> dict:
    """(user id, kind) -> the holds still open, designs then jobs, newest first:
    [(table, its bought column, row id, credits held, the period they were held in)]."""
    holds = defaultdict(list)
    items = bind.execute(
        sa.select(_items)
        .where(sa.or_(_items.c.model_credit_held > 0, _items.c.render_credits_held > 0))
        .order_by(_items.c.id.desc())
    )
    for item in items:
        for kind, held, column in (
            ('model', item.model_credit_held, 'bought_model_credit_held'),
            ('render', item.render_credits_held, 'bought_render_credits_held'),
        ):
            if held:
                holds[(item.user_id, kind)].append((_items, column, item.id, held, item.credits_period_start))
    jobs = bind.execute(
        sa.select(_jobs).where(_jobs.c.credit_state == 'held', _jobs.c.credits > 0).order_by(_jobs.c.id.desc())
    )
    for job in jobs:
        holds[(job.user_id, 'render')].append((_jobs, 'bought_credits', job.id, job.credits, job.billing_period_start))
    return holds


def _bought_since(purchases: list, kind: str, period_start) -> int:
    return sum(
        credits for bought_kind, credits, created_at in purchases
        if bought_kind == kind and (period_start is None or created_at >= period_start)
    )


def _put_spent_bought_on_holds(bind, holds: list, spent: int, period_start) -> None:
    """The bought credits spent since the period began went to its open holds first."""
    for table, column, row_id, held, held_in in holds:
        if spent <= 0:
            return
        if held_in != period_start:
            continue
        taken = min(held, spent)
        spent -= taken
        bind.execute(sa.update(table).where(table.c.id == row_id).values({column: taken}))


def _is_free_without_subscription(row) -> bool:
    return (row.plan_tier or 'free').strip().lower() not in _PAID_TIERS and not row.stripe_subscription_id


def _backfill(bind) -> None:
    purchases = _purchases_by_user(bind)
    holds = _open_holds(bind)
    for row in bind.execute(sa.select(_billing)).all():
        values = {}
        for kind, balance_column, bought_column in _KINDS:
            bought_since = _bought_since(purchases[row.user_id], kind, row.period_start)
            bought = min(max(getattr(row, balance_column) or 0, 0), bought_since)
            values[bought_column] = bought
            _put_spent_bought_on_holds(bind, holds[(row.user_id, kind)], bought_since - bought, row.period_start)
        if _is_free_without_subscription(row):
            values['allowance_granted_for'] = 'free'
        bind.execute(sa.update(_billing).where(_billing.c.id == row.id).values(values))


def upgrade() -> None:
    """Upgrade schema."""
    _add_columns()
    _backfill(op.get_bind())


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('ingest_items') as batch:
        batch.drop_column('bought_render_credits_held')
        batch.drop_column('bought_model_credit_held')
    with op.batch_alter_table('render_jobs') as batch:
        batch.drop_column('bought_credits')
    with op.batch_alter_table('user_billing') as batch:
        batch.drop_column('allowance_granted_for')
        for _, _, bought in reversed(_KINDS):
            batch.drop_column(bought)
