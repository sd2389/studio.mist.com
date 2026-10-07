"""Bulk ingest: a batch of designs uploaded as CAD files, each converted into a scene on a worker
(docs/adr/0006-bulk-pipeline.md, "Tables")."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, BigInteger, DateTime, Float, ForeignKey, Index, Integer, SmallInteger, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.scene import Base

# A batch is a draft until it is submitted, processing while any of its designs is unfinished,
# then completed (every design done) or completed with errors; or canceled.
OPEN_BATCH_STATUSES = ("draft", "processing")
FINISHED_BATCH_STATUSES = ("completed", "completed_with_errors", "canceled")

# A design (an item): awaiting_upload ─confirm─▶ uploaded ─submit─▶ converting ─▶ converted ─▶
# rendering ─▶ done. It fails from converting on, and any unfinished one can be canceled; one
# never uploaded is skipped.
ITEM_STATUSES = (
    "awaiting_upload", "uploaded", "converting", "converted", "rendering", "done", "failed", "skipped", "canceled",
)
FINISHED_ITEM_STATUSES = ("done", "failed", "skipped", "canceled")
UNFINISHED_ITEM_STATUSES = tuple(status for status in ITEM_STATUSES if status not in FINISHED_ITEM_STATUSES)
_IN_PROGRESS = text("status NOT IN ('done', 'failed', 'skipped', 'canceled')")
_CONVERTED = text("status = 'converted'")


class IngestBatch(Base):
    """The designs one customer dropped at once, with how to convert and render them."""

    __tablename__ = "ingest_batches"
    __table_args__ = (
        Index("ix_ingest_batches_user_id_created_at", "user_id", "created_at"),
        Index("uq_ingest_batches_user_id_idempotency_key", "user_id", "idempotency_key", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(24), default="draft")
    source: Mapped[str] = mapped_column(String(8), default="studio")  # studio | api
    look_template: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # materials by slot role (F1)
    render_plan: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # normalised; none renders nothing
    options: Mapped[dict] = mapped_column(JSON, default=dict)  # decimate, default_category
    item_count: Mapped[int] = mapped_column(Integer, default=0)
    total_bytes: Mapped[int] = mapped_column(BigInteger, default=0)  # every file, companions included
    # What the render plan costs a design, priced when the batch was made; every hold takes it.
    render_credits_per_design: Mapped[int] = mapped_column(Integer, default=0)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    request_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)  # SHA-256 of the request
    # The ZIP parts of its archive, when one is made (F3): [{name, key, bytes, files, sha256}], in
    # order, the job that made them, and when they are deleted. The parts count toward the owner's
    # storage until then; the job's id tells one archive from the next that replaces it.
    archive_keys: Mapped[list | None] = mapped_column(JSON, nullable=True)
    archive_job_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    archive_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # its raw CAD files go
    # When the retention sweep deleted its raw CAD files: its designs can't convert again.
    sources_deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class IngestItem(Base):
    """One design of a batch: its CAD file (and companions), where it is, and the scene it became."""

    __tablename__ = "ingest_items"
    __table_args__ = (
        Index("ix_ingest_items_batch_id_status", "batch_id", "status"),
        Index("ix_ingest_items_batch_id_position", "batch_id", "position"),
        Index("uq_ingest_items_batch_id_sku", "batch_id", "sku", unique=True),
        # Reserves a SKU across batches while its design is in progress, until its scene holds it.
        Index(
            "uq_ingest_items_sku_in_progress",
            "sku",
            unique=True,
            postgresql_where=_IN_PROGRESS,
            sqlite_where=_IN_PROGRESS,
        ),
        Index("ix_ingest_items_scene_id", "scene_id"),
        # Designs left converted, which each claim's sweep looks for (ingest/renders.py): few or none.
        Index("ix_ingest_items_converted", "id", postgresql_where=_CONVERTED, sqlite_where=_CONVERTED),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    batch_id: Mapped[int] = mapped_column(Integer, ForeignKey("ingest_batches.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"))  # owner, no join
    position: Mapped[int] = mapped_column(Integer)  # its place in the request
    filename: Mapped[str] = mapped_column(String(512))  # the relative path as dropped
    source_key: Mapped[str] = mapped_column(String(512))  # customers/<user>/ingest/<batch>/<item>/<name>
    source_bytes: Mapped[int] = mapped_column(BigInteger)  # declared, then checked against storage
    companions: Mapped[list] = mapped_column(JSON, default=list)  # [{filename, key, bytes}]: an MTL, a .bin
    sku: Mapped[str] = mapped_column(String(128))
    name: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(128))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    units: Mapped[str] = mapped_column(String(8), default="auto")  # auto, mm, cm, in, m
    status: Mapped[str] = mapped_column(String(16), default="awaiting_upload")
    error: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)  # retries
    scene_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("scenes.id", ondelete="SET NULL"), nullable=True)
    convert_job_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("render_jobs.id", ondelete="SET NULL"), nullable=True
    )
    # Credits held for the design and not yet spent: the model credit its scene takes, the
    # render credits its render plan's jobs take; the period they were held in, and the owner's
    # allowance generation then, which a refund checks.
    model_credit_held: Mapped[int] = mapped_column(SmallInteger, default=0)
    render_credits_held: Mapped[int] = mapped_column(Integer, default=0)
    # Of those held, the ones the hold took from bought credits, given back as bought; a job the
    # design's render credits move to takes its share of them.
    bought_model_credit_held: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")
    bought_render_credits_held: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    credits_period_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    credits_allowance_generation: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # What the design was given back of what it held, every time it failed or was canceled: the
    # batch's refunded credits, with those of its jobs.
    model_credits_refunded: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")
    render_credits_refunded: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # The piece's embed link, APP_PUBLIC_URL/embed/<SKU>, once its scene holds the SKU (F3's manifest lists it).
    embed_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    polygon_count: Mapped[int | None] = mapped_column(Integer, nullable=True)  # counted from its GLB
    size_mm: Mapped[float | None] = mapped_column(Float, nullable=True)  # its longest side
    warnings: Mapped[list] = mapped_column(JSON, default=list)  # unit guesses, decimation, skipped layers
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
