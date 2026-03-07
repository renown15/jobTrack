"""Security helpers for jobtrack_core.

This module intentionally re-exports small, stable functions from
Werkzeug so other modules can import from `jobtrack_core.security` without
pulling Werkzeug directly at many call sites. Keep this file minimal
to avoid import cycles during app startup.
"""

from werkzeug.security import generate_password_hash as _gp, check_password_hash as _ch


def generate_password_hash(
    password: str, method: str | None = None, salt_length: int | None = None
) -> str:
    """Generate a password hash using Werkzeug's helper.

    Signature matches Werkzeug's `generate_password_hash` but this thin
    shim lets the rest of the app import from `jobtrack_core.security`.
    """
    # Delegate to Werkzeug implementation; only pass arguments if provided
    if method is None and salt_length is None:
        return _gp(password)
    if method is not None and salt_length is None:
        return _gp(password, method)
    if method is not None and salt_length is not None:
        return _gp(password, method, salt_length)
    # If salt_length provided but method is None, fall back to calling without extras
    return _gp(password)


def check_password_hash(pwhash: str, password: str) -> bool:
    """Check a password against the given hash."""
    return _ch(pwhash, password)
