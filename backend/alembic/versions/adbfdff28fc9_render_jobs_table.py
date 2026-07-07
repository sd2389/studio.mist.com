"""render jobs table

Revision ID: adbfdff28fc9
Revises: 2257b6e54264
Create Date: 2026-07-07 03:08:18.999583

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'adbfdff28fc9'
down_revision: Union[str, Sequence[str], None] = '2257b6e54264'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'render_jobs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('scene_id', sa.Integer(), nullable=True),
        sa.Column('model_ref', sa.String(length=1024), nullable=False),
        sa.Column('lighting', sa.String(length=32), nullable=False),
        sa.Column('preset', sa.String(length=64), nullable=False),
        sa.Column('width', sa.Integer(), nullable=False),
        sa.Column('height', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('worker_token', sa.String(length=64), nullable=False),
        sa.Column('result_key', sa.String(length=512), nullable=True),
        sa.Column('error', sa.String(length=1024), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['scene_id'], ['scenes.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_render_jobs_status'), 'render_jobs', ['status'], unique=False)
    op.create_index(op.f('ix_render_jobs_user_id'), 'render_jobs', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_render_jobs_user_id'), table_name='render_jobs')
    op.drop_index(op.f('ix_render_jobs_status'), table_name='render_jobs')
    op.drop_table('render_jobs')
