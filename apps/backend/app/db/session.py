from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from ..config import get_settings


@lru_cache
def get_engine() -> Engine:
    return create_engine(get_settings().resolved_database_url, pool_pre_ping=True, pool_size=5, max_overflow=5)


@lru_cache
def _factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False, autoflush=False)


def new_session() -> Session:
    return _factory()()


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one transaction per request; commit on success, rollback on error."""
    session = new_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
