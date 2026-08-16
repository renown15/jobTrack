"""Register blueprints found under `jobtrack_core.routes`.

This helper imports known route modules and registers any Blueprint
instances they expose as `api`, `bp`, or `blueprint` onto the provided
Flask app. It's defensive: failures to import or missing attributes are
logged but do not abort registration.
"""

from typing import Iterable
import importlib
import logging

from flask import Flask, Blueprint

_log = logging.getLogger(__name__)

# Known route modules to attempt to register. Keep this list in sync with
# files present under jobtrack/routes. Missing modules are skipped.
_ROUTE_MODULES = [
    "jobtrack_core.routes.static",
    "jobtrack_core.routes.health",
    "jobtrack_core.routes.auth",
    "jobtrack_core.routes.admin",
    "jobtrack_core.routes.contacts",
    "jobtrack_core.routes.contacts_extra",
    "jobtrack_core.routes.organisations",
    "jobtrack_core.routes.engagements",
    "jobtrack_core.routes.tasks",
    "jobtrack_core.routes.sectors",
    "jobtrack_core.routes.root",
]


def _iter_blueprints_from_module(module) -> Iterable[Blueprint]:
    # Common attribute names used for blueprints in modules
    for name in ("api", "bp", "blueprint"):
        obj = getattr(module, name, None)
        if isinstance(obj, Blueprint):
            yield obj


def register_blueprints(app: Flask) -> None:
    """Import route modules and register any discovered Blueprints.

    This is safe to call multiple times; duplicate registrations are
    ignored by Flask.
    """
    for modname in _ROUTE_MODULES:
        try:
            mod = importlib.import_module(modname)
        except Exception as e:
            _log.debug("Skipping route module %s: import error: %s", modname, e)
            continue

        for bp in _iter_blueprints_from_module(mod):
            try:
                # Skip if a blueprint with the same name is already registered
                bp_name = getattr(bp, "name", None)
                if bp_name and bp_name in app.blueprints:
                    _log.debug(
                        "Skipping blueprint registration for %s from %s: already registered",
                        bp_name,
                        modname,
                    )
                else:
                    app.register_blueprint(bp)
                    _log.info(
                        "Registered blueprint %s from %s",
                        getattr(bp, "name", "<bp>"),
                        modname,
                    )
            except Exception as e:
                _log.warning("Failed to register blueprint from %s: %s", modname, e)
