from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.scene import Base

if TYPE_CHECKING:
    from app.models.scene import Scene


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), default="My Project")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    scenes: Mapped[list["Scene"]] = relationship("Scene", back_populates="project")
