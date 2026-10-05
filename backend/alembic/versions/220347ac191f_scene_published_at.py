"""scene published_at

Revision ID: 220347ac191f
Revises: 6193872e4443
Create Date: 2026-10-03 01:30:00.000000

When a scene's public copies (published/<user>/<sku>/...) were last made; null while it has
none. Scene URLs come from it, so lists no longer ask storage whether the copies exist.

Until now every save of a scene with a SKU published it, so those scenes start out published
and their public URLs keep working from the deploy on. `python -m scripts.backfill_published_at`
then checks each one against storage once, and publishes again any whose copies are missing.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '220347ac191f'
down_revision: Union[str, Sequence[str], None] = '6193872e4443'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('scenes', sa.Column('published_at', sa.DateTime(), nullable=True))
    op.execute("UPDATE scenes SET published_at = updated_at WHERE TRIM(COALESCE(sku, '')) <> ''")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('scenes', 'published_at')
