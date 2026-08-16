"""Route package stubs for big-bang refactor.

This package will host grouped blueprints extracted from `app.py`.
Keeping this minimal so imports succeed during incremental moves.
"""

from flask import Blueprint


# Example blueprint placeholder; real routes will be moved here during refactor.
api = Blueprint("api", __name__)

__all__ = ["api"]
# Routes package for breaking `app.py` into feature modules.
# Populate this package with feature blueprints during the refactor.
__all__ = []
