"""jobtrack_core.utils package.

Expose small utility helpers used across the refactor. Keep this file
minimal to avoid import cycles during the big-bang restructuring.
"""

from typing import Any


def parse_int(value: Any, param_name: str = "id") -> int:
    """Parse a value into an int in a defensive, typed way.

    Raises ValueError if the value cannot be converted to an int.
    """
    if isinstance(value, int):
        return value

    if value is None:
        raise ValueError(f"missing integer for parameter '{param_name}'")

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

    try:
        return int(value)
    except Exception:
        raise ValueError(f"invalid integer for parameter '{param_name}'")


__all__ = ["parse_int"]
