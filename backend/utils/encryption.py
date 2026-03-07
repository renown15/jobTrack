"""JobTrack encryption utilities.

Provides app-level Fernet helpers, PBKDF2 key derivation for pgcrypto usage,
and a helper to fetch/create per-applicant salts from the DB. This centralises
encryption logic so other modules (navigator, etc.) can import it.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os

from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)


# NOTE: App-level Fernet-based encryption has been removed in favour of
# DB-side encryption using pgcrypto and a single `JOBTRACK_PG_KEY` passphrase.
# The helpers below keep key-derivation and per-applicant salt lookup logic
# used by parts of the codebase; they intentionally avoid any reliance on
# legacy `NAVIGATOR_BRIEFING_KEY` environment variables.


def derive_key_from_password(
    password: str, salt: bytes, iterations: int = 200000
) -> str:
    """Derive a base64-encoded key using PBKDF2-HMAC-SHA256.

    Suitable for use as a pgcrypto passphrase when the app derives a key
    from a user-supplied password.
    """
    if password is None:
        return ""
    if isinstance(salt, str):
        salt = salt.encode("utf-8")
    try:
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, iterations, dklen=32
        )
        return base64.b64encode(dk).decode("utf-8")
    except Exception as e:
        logger.exception("derive_key_from_password failed: %s", e)
        return ""


def get_or_create_user_salt(conn_or_connlike, applicantid: int) -> str:
    """Return a per-applicant salt string.

    The function attempts a DB lookup when given a real connection or cursor.
    When no DB access is available it falls back to the `JOBTRACK_SALT`
    environment variable (if present) or a deterministic development value
    `jobtrack-salt-<applicantid>`.
    """
    try:
        if hasattr(conn_or_connlike, "cursor"):
            cur = None
            try:
                cur = conn_or_connlike.cursor(cursor_factory=RealDictCursor)
                cur.__enter__()
                # Query the canonical `usersalt` table in the main jobtrack DB
                cur.execute(
                    "SELECT salt FROM usersalt WHERE applicantid = %s LIMIT 1;",
                    (applicantid,),
                )
                r = cur.fetchone()
                try:
                    cur.__exit__(None, None, None)
                except Exception as e:
                    logger.exception("cursor __exit__ failed: %s", e)
                if r:
                    sval = (
                        r.get("salt")
                        if isinstance(r, dict)
                        else (r[0] if len(r) > 0 else None)
                    )
                    if sval:
                        return sval
            except Exception as e:
                # Log DB errors and fall back to environment/default
                logger.exception("get_or_create_user_salt DB lookup failed: %s", e)
    except Exception as e:
        logger.exception("get_or_create_user_salt unexpected error: %s", e)

    return os.environ.get("JOBTRACK_SALT", f"jobtrack-salt-{applicantid}")
