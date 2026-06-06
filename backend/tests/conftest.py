"""Shared pytest fixtures for money-path billing tests."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base


@pytest.fixture()
def db() -> Session:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def sample_user(db: Session):
    from datetime import datetime

    from app.features.billing.quota_service import get_or_create_billing
    from app.models.user import User

    user = User(
        email="user@example.com",
        password_hash="hash",
        role="user",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    get_or_create_billing(db, user)
    return user


@pytest.fixture()
def admin_user(db: Session):
    from datetime import datetime

    from app.models.user import User

    user = User(
        email="admin@example.com",
        password_hash="hash",
        role="admin",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
