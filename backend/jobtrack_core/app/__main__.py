"""Module runner for the jobtrack_core.app bridge.

This allows running the app via `python -m jobtrack_core.app` while the
big-bang refactor is in progress. It delegates to the existing
top-level application via the `create_app()` bridge in
`jobtrack_core.app.__init__`.
"""

from __future__ import annotations

import os

from jobtrack_core.app import create_app


def main(argv: list[str] | None = None) -> int:
    # Create the Flask app (bridge to top-level `app.py` for now)
    app = create_app()

    port = int(os.environ.get("PORT", "8080"))
    debug = os.environ.get("DEV_DEBUG", "0") == "1"
    # Respect LOG_LEVEL via environment if the app inspects it
    # Emit a friendly startup banner (copied from the original monolith entrypoint)
    print("----------------------------------------------------------")
    print(f"   Starting JobTrack Backend API on http://127.0.0.1:{port}")
    print("----------------------------------------------------------")
    print(f"   Starting on http://127.0.0.1:{port}")
    # Print configured database name for diagnostics
    try:
        from jobtrack_core import db_core

        db_name = db_core.get_database_name()
        print(f"   DATABASE: {db_name or '(not configured)'}")
    except Exception:
        pass
    try:
        app.logger.debug("Starting app with debug=%s", debug)
    except Exception:
        # best-effort logging; don't fail startup if logger isn't configured yet
        pass

    # Run the built-in Flask dev server as before. When DEV_DEBUG is enabled
    # we also enable the reloader so code changes restart the process.
    # Note: reloader may not be appropriate in some container/production setups.
    app.run(host="0.0.0.0", port=port, debug=debug, use_reloader=debug)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
