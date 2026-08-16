"""Bridge package for Navigator AI (temporary during refactor).

This module re-exports the existing `jobtrack_navigator_ai` package
so callers can gradually switch to `jobtrack_core.navigator_ai` imports.
"""

# Re-export public symbols from the legacy top-level package
try:
    from jobtrack_navigator_ai import *  # noqa: F401,F403
except Exception:
    # If the legacy package fails to import in the current environment,
    # keep the bridge import safe and log at import time in runtime.
    pass
