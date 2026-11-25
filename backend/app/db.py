from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session


@contextmanager
def atomic_session(session: Session) -> Iterator[Session]:
    """Commit one write unit while preserving a transaction already opened by auth."""
    try:
        with session.begin_nested():
            yield session
        session.commit()
    except BaseException:
        session.rollback()
        raise
