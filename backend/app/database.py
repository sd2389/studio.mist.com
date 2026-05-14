from collections.abc import Generator

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.models import Base, Project

settings = get_settings()
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """Seed default project. Schema is owned by Alembic — run `alembic upgrade head` first."""
    with SessionLocal() as db:
        existing = db.execute(select(Project).limit(1)).scalar_one_or_none()
        if existing is None:
            db.add(Project(id=1, name="My Project"))
            db.commit()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
