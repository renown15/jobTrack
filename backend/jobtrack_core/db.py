import functools
from typing import Any, Callable, Optional

from psycopg2.extras import RealDictCursor


def get_conn():
    """Return a context manager providing a DB connection.

    This wraps the repo's existing `Database()` context manager defined
    in `app.py` to avoid duplicating configuration here and to keep
    behavior identical during the Phase 2 migration.
    """
    # Import locally to avoid circular imports at module import time
    from jobtrack_core import db_core

    # Return the Database context manager from db_core. Tests commonly
    # monkeypatch `jobtrack_core.db_core.Database`, so returning that class
    # ensures the monkeypatch intercepts `get_conn()` as well.
    return db_core.Database()


def query(sql: str, params: Optional[tuple] = None, cursor_factory=RealDictCursor):
    """Execute a SELECT-style query and return fetched rows as a list.

    This is a small convenience wrapper to simplify read-only DB access
    in future refactors. It intentionally keeps behavior minimal.
    """
    with get_conn() as conn:
        with conn.cursor(cursor_factory=cursor_factory) as cur:
            cur.execute(sql, params or ())
            return cur.fetchall() or []


def with_db(func: Callable[..., Any]) -> Callable[..., Any]:
    """Decorator that injects a cursor as the first argument to `func`.

    Example:
        @with_db
        def my_handler(cur, *args):
            cur.execute(...)

    The underlying connection is committed when the wrapped function
    returns without exception, and rolled back on exceptions.
    """

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        with get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                try:
                    result = func(cur, *args, **kwargs)
                    try:
                        conn.commit()
                    except Exception:
                        # keep behavior conservative; callers may handle commits
                        pass
                    return result
                except Exception:
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                    raise

    return wrapper
