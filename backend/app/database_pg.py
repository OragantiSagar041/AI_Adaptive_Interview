import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import DATABASE_URL

# Lazy engine creation — only connect when first used.
# This prevents startup failure if psycopg2 is not installed or
# the Postgres database is not available (the primary DB is MongoDB).
_engine = None
_SessionLocal = None


def _get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(DATABASE_URL, future=True, echo=False)
    return _engine


def _get_session_local():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=_get_engine(), expire_on_commit=False, future=True)
    return _SessionLocal


class _LazySessionLocal:
    """Proxy that defers engine creation until the first session is opened."""
    def __call__(self, *args, **kwargs):
        return _get_session_local()(*args, **kwargs)

    def __call__(self):
        return _get_session_local()()


SessionLocal = _LazySessionLocal()
Base = declarative_base()
