from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.scene import Base

if TYPE_CHECKING:
    from app.models.scene import Scene


class Render(Base):
    __tablename__ = "renders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scene_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("scenes.id", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(String(512))
    bytes: Mapped[int] = mapped_column(Integer, default=0)
    kind: Mapped[str] = mapped_column(String(32), default="still")
    material: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lighting: Mapped[str | None] = mapped_column(String(64), nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    scene: Mapped["Scene"] = relationship("Scene", back_populates="renders")
