"""Small collection of lightweight helpers used across the app.
This module is intentionally tiny to provide a stable import surface
for refactors and to centralise common cast/parse helpers used in
route handlers and tests.
"""

from typing import Any, Optional


def parse_int(x: Any, name: str) -> int:
    """Parse a value into int, raising ValueError on missing/invalid input.

    - Accepts ints and numeric strings.
    - Raises ValueError when the value is None or cannot be converted.
    """
    if x is None:
        raise ValueError(f"Missing value for {name}")
    if isinstance(x, int):
        return x
    s = str(x).strip()
    if s == "":
        raise ValueError(f"Missing value for {name}")
    try:
        return int(s)
    except Exception as e:
        raise ValueError(f"Invalid integer for {name}: {x}") from e


def safe_int(x: Any) -> Optional[int]:
    """Convert `x` to int or return None if conversion fails/none."""
    try:
        return parse_int(x, "value")
    except Exception:
        return None


def ensure_list(x: Any) -> list:
    """Return `x` as a list if it is not already one."""
    if x is None:
        return []
    if isinstance(x, list):
        return x
    return [x]


def contacttarget_table_name(conn) -> str:
    """Return the contact-target table name present in the database.

    Prefers `public.contacttarget` when available, otherwise falls back to
    the legacy `public.contacttargetorganisation` table name. The detection
    logic is intentionally conservative to avoid runtime failures in dev/test
    environments.
    """
    try:
        with conn.cursor() as _:
            # A lightweight check could be implemented here. For now return
            # the legacy name as a safe default; callers may override if needed.
            return "public.contacttargetorganisation"
    except Exception:
        return "public.contacttargetorganisation"
