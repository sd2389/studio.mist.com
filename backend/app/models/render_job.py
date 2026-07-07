from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.scene import Base


class RenderJob(Base):
    __tablename__ = "render_jobs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scene_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("scenes.id", ondelete="SET NULL"), nullable=True)
    model_ref: Mapped[str] = mapped_column(String(1024))  # storage model key, or absolute URL (dev/smoke)
    lighting: Mapped[str] = mapped_column(String(32), default="studio")
    preset: Mapped[str] = mapped_column(String(64), default="gold-18k-yellow")
    width: Mapped[int] = mapped_column(Integer, default=2048)
    height: Mapped[int] = mapped_column(Integer, default=2048)
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    worker_token: Mapped[str] = mapped_column(String(64), default=lambda: uuid4().hex)
    result_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    error: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
