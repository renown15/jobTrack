"""Database core primitives extracted from app.py.

Provides DB_CONFIG and Database context manager so other modules can
import these at module import time without circular imports.
"""

import os
from urllib.parse import unquote, urlparse

import psycopg2

_db_url = os.getenv("DATABASE_URL")
_db_url_missing = False
if not _db_url:
    _db_url_missing = True
    _DB_CONFIG = {}
else:
    _parsed = urlparse(_db_url)
    _DB_CONFIG = {
        "host": _parsed.hostname,
        "port": _parsed.port,
        "database": _parsed.path.lstrip("/") if _parsed.path else "",
        "user": unquote(_parsed.username) if _parsed.username else "",
        "password": unquote(_parsed.password) if _parsed.password else "",
    }
    if not _DB_CONFIG.get("host"):
        raise RuntimeError(
            "DATABASE_URL must include a hostname (e.g. 'postgres://user:pass@host:5432/dbname')"
        )
    if not _DB_CONFIG.get("database"):
        raise RuntimeError(
            "DATABASE_URL must include a database name/path (e.g. '/dbname')"
        )


def _build_conn_params(database: str | None = None) -> dict:
    """Return a copy of the internal DB params, optionally overriding database."""
    if _db_url_missing:
        raise RuntimeError("DATABASE_URL is not configured in the environment")
    params = dict(_DB_CONFIG)
    if database:
        params["database"] = database
    return params


def get_connection(database: str | None = None):
    """Return a context manager (psycopg2 connection) for the given database.

    This is the only public accessor modules should use; it does not expose
    the raw credential dict.
    """
    # Return the Database context manager so callers can use `with get_connection()`
    # and tests that monkeypatch `jobtrack_core.db_core.Database` will intercept it.
    return Database(database)


def get_database_name() -> str:
    """Return the configured default database name (read-only)."""
    if _db_url_missing:
        return ""
    # Ensure we always return a str (mypy expects a str return type)
    return str(_DB_CONFIG.get("database", ""))


class Database:
    """A utility class to manage PostgreSQL connections and queries.

    This mirrors the original implementation from `app.py` so behavior
    remains unchanged during the refactor.
    """

    def __init__(self, database: str | None = None):
        self.conn = None
        self._database = database

    def __enter__(self):
        """Connects to the database and returns the connection object."""
        try:
            self.conn = psycopg2.connect(**_build_conn_params(self._database))
            return self.conn
        except psycopg2.Error as e:
            print(f"❌ Database Connection Error: {e}")
            raise

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Commits changes and closes the connection."""
        if self.conn:
            if exc_type is None:
                self.conn.commit()
            else:
                self.conn.rollback()
            self.conn.close()
