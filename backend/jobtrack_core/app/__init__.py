"""App factory bridge for the migration.

This module provides a `create_app()` factory and a module-level `app`
that currently delegates to the existing top-level `app.py` Flask
application. It's a temporary bridge used while we split the monolith.
"""

from typing import Optional
from flask import Flask


def create_app(config_name: Optional[str] = None) -> Flask:
    # Import the existing Flask app from top-level app.py for now.
    # After the big-bang move this will construct the app from scratch.
    from app import app as _app  # type: ignore

    # Note: blueprint registration is handled by the top-level `app.py` at
    # process startup. Do not attempt to register blueprints again here —
    # importing and returning the top-level app is sufficient.

    return _app


# WSGI-compatible module-level `app` variable
app = create_app()
