"""Utility helpers for jobtrack_core.

Small, well-typed helpers used during the refactor. Keep this file minimal
so it can be imported safely from `app.py` without creating import cycles.
"""

from typing import Any


def parse_int(value: Any, param_name: str = "id") -> int:
    """Parse a value into an int in a defensive, typed way.

    Raises ValueError if the value cannot be converted to an int.

    Use this helper to replace `int(...)` callsites where inputs may be
    `None` or unknown types (e.g. values coming from HTTP request args).
    The caller should translate ValueError into the appropriate HTTP 400
    response (or other application-specific error handling).
    """
    if isinstance(value, int):
        return value

    if value is None:
        raise ValueError(f"missing integer for parameter '{param_name}'")

    # Allow bytes and str-like values
    if isinstance(value, (bytes, bytearray)):
        try:
            value = value.decode("utf-8")
        except Exception:
            raise ValueError(f"invalid integer for parameter '{param_name}'")

    if isinstance(value, str):
        s = value.strip()
        if s == "":
            raise ValueError(f"empty value for parameter '{param_name}'")
        try:
            return int(s)
        except ValueError:
            raise ValueError(f"invalid integer for parameter '{param_name}'")

    # Fallback for other convertible numeric-like types
    try:
        return int(value)
    except Exception:
        raise ValueError(f"invalid integer for parameter '{param_name}'")
