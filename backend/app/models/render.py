from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.scene import Base

if TYPE_CHECKING:
    from app.models.scene import Scene


class Render(Base):
    """A file rendered from a scene: a saved still, or an output of a render job."""

    __tablename__ = "renders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scene_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("scenes.id", ondelete="CASCADE"), index=True
    )
    job_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("render_jobs.id", ondelete="SET NULL", name="fk_renders_job_id_render_jobs"),
        nullable=True,
        index=True,
    )
    key: Mapped[str] = mapped_column(String(512))
    bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    kind: Mapped[str] = mapped_column(String(32), default="still")  # still, turntable, spin, campaign_pack
    material: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lighting: Mapped[str | None] = mapped_column(String(64), nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)  # the download name
    label: Mapped[str | None] = mapped_column(String(128), nullable=True)  # e.g. front, 18k-yellow-gold
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # frames, fps, duration, SHA-256
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # pack ZIPs and archives
    # Its copy in the public bucket, published/<user>/<sku>/media/<job>/<file>, when the batch it
    # was rendered for publishes its media (docs/adr/0006-bulk-pipeline.md, "Render plans").
    public_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    scene: Mapped["Scene"] = relationship("Scene", back_populates="renders")
