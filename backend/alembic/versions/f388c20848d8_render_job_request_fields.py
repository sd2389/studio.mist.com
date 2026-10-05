"""render jobs keep the variant and the name their request gave

Revision ID: f388c20848d8
Revises: 12a67b9ab68f
Create Date: 2026-10-05 13:40:00.000000

A job answers what its request asked for besides the spec and the look it keeps already, so a
client can ask for the same job again (a Retry): the saved variant it named and the file stem
it gave. Jobs made before have neither.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f388c20848d8'
down_revision: Union[str, Sequence[str], None] = '12a67b9ab68f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('render_jobs', sa.Column('variant_id', sa.String(length=64), nullable=True))
    op.add_column('render_jobs', sa.Column('name', sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Batch mode, so SQLite (tests) drops columns too.
    with op.batch_alter_table('render_jobs') as batch:
        batch.drop_column('name')
        batch.drop_column('variant_id')
