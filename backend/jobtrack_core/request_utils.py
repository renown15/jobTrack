"""Request-related helpers extracted from app.py to avoid importing `app`.

Contains `parse_applicantid_from_body` and `require_applicant_allowed` used
across the backend. These are conservative copies of the originals adapted to
avoid referencing `app` directly (use `logging` + `flask.jsonify`).
"""

import logging
import os
from typing import Optional

from flask import jsonify, request, session

logger = logging.getLogger(__name__)


def parse_applicantid_from_body() -> Optional[int]:
    """Parse `applicantid` from request body/args/headers/session.

    Returns an int when present and valid, otherwise None.
    """
    data = request.get_json(silent=True) or {}
    if data.get("applicantid") is not None:
        try:
            val = data.get("applicantid")
            if isinstance(val, (int, str)):
                return int(val)
            return None
        except Exception:
            return None
    try:
        aid = request.args.get("applicantid")
        if aid:
            return int(aid)
    except Exception:
        logger.debug("Failed parsing applicantid from args")
    try:
        aid = request.headers.get("X-Applicant-Id")
        if aid:
            return int(aid)
    except Exception:
        logger.debug("Failed parsing applicantid from headers")
    try:
        session_aid = session.get("applicantid")
        if session_aid:
            return int(session_aid)
    except Exception:
        logger.debug("Failed parsing applicantid from session")
    return None


def require_applicant_allowed(applicantid: int):
    """Ensure current session is authenticated and allowed for `applicantid`.

    Returns None when allowed; otherwise returns a Flask response tuple
    (json, status) which callers should `return` immediately.
    """
    try:
        if os.getenv("DEV_DEBUG", "0") == "1":
            dev_hdr = request.headers.get("X-Applicant-Id") or request.args.get(
                "applicantid"
            )
            if dev_hdr:
                try:
                    session["applicantid"] = int(dev_hdr)
                    logging.getLogger(__name__).info(
                        "DEV_DEBUG: set session applicantid from header/param -> %s",
                        dev_hdr,
                    )
                except Exception:
                    logging.getLogger(__name__).debug(
                        "DEV_DEBUG: failed to set session applicantid from header/param"
                    )
    except Exception:
        logging.getLogger(__name__).debug("Error in DEV_DEBUG applicantid handling")

    session_aid = session.get("applicantid")
    if not session_aid:
        return (jsonify({"error": "Not authenticated"}), 401)
    try:
        if int(session_aid) != int(applicantid):
            return (jsonify({"error": "Not authorized for applicantid"}), 403)
    except Exception:
        return (jsonify({"error": "Invalid session applicantid"}), 400)
    return None
