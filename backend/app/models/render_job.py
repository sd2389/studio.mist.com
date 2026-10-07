from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, SmallInteger, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.scene import Base


class RenderJob(Base):
    """One server render: a kind, its spec and the look it renders (docs/adr/0005-server-exports.md)."""

    __tablename__ = "render_jobs"
    __table_args__ = (
        # Claims take the oldest job of the highest priority; lapsed leases are found by expiry.
        Index("ix_render_jobs_claim", "status", "priority", "created_at", postgresql_where=text("status = 'queued'")),
        Index("ix_render_jobs_lease", "status", "lease_expires_at", postgresql_where=text("status = 'running'")),
        Index("ix_render_jobs_user_id_status", "user_id", "status"),
        Index("ix_render_jobs_user_id_id", "user_id", "id"),
        Index("ix_render_jobs_scene_id_created_at", "scene_id", "created_at"),
        Index("ix_render_jobs_batch_id_status", "batch_id", "status"),
        Index("uq_render_jobs_user_id_idempotency_key", "user_id", "idempotency_key", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scene_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("scenes.id", ondelete="SET NULL"), nullable=True)
    # An ingest batch's job (ADR 0006), and the design it is for.
    batch_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("ingest_batches.id", ondelete="SET NULL", name="fk_render_jobs_batch_id_ingest_batches"),
        nullable=True,
    )
    ingest_item_id: Mapped[int | None] = mapped_column(
        Integer,
        # A design names its convert job too: this key is the one added after both tables exist.
        ForeignKey(
            "ingest_items.id",
            ondelete="SET NULL",
            name="fk_render_jobs_ingest_item_id_ingest_items",
            use_alter=True,
        ),
        nullable=True,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(24), default="still")
    spec: Mapped[dict] = mapped_column(JSON, default=dict)  # normalised, with its frame count and output names
    look: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # validated and frozen at creation
    # What else the request named, so a client can ask for the same job again.
    variant_id: Mapped[str | None] = mapped_column(String(64), nullable=True)  # the saved variant it asked for
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)  # the file stem it gave
    watermark: Mapped[bool] = mapped_column(Boolean, default=True)  # the owner's plan at creation
    priority: Mapped[int] = mapped_column(SmallInteger, default=100)  # 100 from the studio, 10 for batches
    max_running: Mapped[int] = mapped_column(SmallInteger, default=1)  # the owner's running cap at creation
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(SmallInteger, default=3)
    run_after: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # retry backoff
    worker_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Reissued on every claim, and when a lapsed lease is taken back.
    worker_token: Mapped[str] = mapped_column(String(64), default=lambda: uuid4().hex)
    # Set by every claim, extended by every heartbeat within the kind's run time.
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    progress: Mapped[float] = mapped_column(Float, default=0.0)  # 0 to 1
    stage: Mapped[str | None] = mapped_column(String(16), nullable=True)
    cancel_requested_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    credits: Mapped[int] = mapped_column(Integer, default=0)  # held, then charged or refunded
    # Of `credits`, those the hold took from bought credits: a refund gives them back as bought.
    bought_credits: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    credit_state: Mapped[str] = mapped_column(String(12), default="none")  # held | charged | refunded | none
    billing_period_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # when it was held
    # The owner's allowance_generation when the credits were held: the refund gives back their
    # plan part only while it is the same, as no allowance has replaced those plan credits yet.
    billing_allowance_generation: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    request_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)  # SHA-256 of the request
    error: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    renderer: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # browser, backend, adapter
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # When the current attempt was claimed; its kind's run time limit counts from it.
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
