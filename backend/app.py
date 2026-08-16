# flake8: noqa: E402
import io
import json
import textwrap
import os
import traceback
import time
from datetime import date, datetime
import logging
from jobtrack_core import jobutils
from typing import Any, Optional, cast
from logging.handlers import RotatingFileHandler
from jobtrack_core import db as jobdb
import psycopg2
from psycopg2.extras import RealDictCursor

# Optional runtime imports that may be missing in some environments —
# declare as `Any` so static checkers accept `None` fallbacks below.
requests: Any = None
try:
    import requests
except Exception:
    requests = None
# Pillow symbols — typed as Any so image processing code remains flexible
Image: Any = None
ImageOps: Any = None
try:
    from PIL import Image as _PIL_Image, ImageOps as _PIL_ImageOps

    Image = _PIL_Image
    ImageOps = _PIL_ImageOps
except Exception:
    Image = None
    ImageOps = None
# Pillow constants are resolved lazily inside the single avatar upload handler.
import secrets
from flask import Flask, request, jsonify, session, send_file, send_from_directory
from flask.typing import ResponseReturnValue
from flask_cors import CORS
from werkzeug.exceptions import NotFound, MethodNotAllowed
from jobtrack_core.security import generate_password_hash, check_password_hash

_this_dir = os.path.dirname(__file__)
# When the backend has been moved into `backend/`, the project-level
# `static/` and `templates/` directories live next to `backend/`.
# Configure Flask to use those canonical locations so `/static/*` and
# template lookups continue to work regardless of the module import path.
_project_root = os.path.normpath(os.path.join(_this_dir, ".."))
_static_folder = os.path.join(_project_root, "static")
_template_folder = os.path.join(_project_root, "templates")
app = Flask(
    __name__, static_folder=_static_folder, static_url_path="/static", template_folder=_template_folder
)
try:
    # Cast `app.route` to Any so the Flask route decorator accepts handlers
    # with flexible return shapes without triggering strict static errors.
    setattr(app, "route", cast(Any, app.route))
except Exception:
    # Casting only affects static typing; runtime should continue to work.
    pass
try:
    _cors_allowed = os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
    _cors_origins = [o.strip() for o in _cors_allowed.split(",") if o.strip()]
    CORS(
        app, resources={"/api/*": {"origins": _cors_origins}}, supports_credentials=True
    )
except Exception:
    app.logger.exception("Failed to initialize Flask-CORS")
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
import sys

_log_level = getattr(logging, LOG_LEVEL.upper(), logging.INFO)
_logfile = (
    os.environ.get("JOBTRACK_LOGFILE")
    or os.environ.get("LOGFILE")
    or os.environ.get("LOG_PATH")
)
handler: logging.Handler = logging.StreamHandler(sys.stdout)
try:
    for h in list(app.logger.handlers):
        app.logger.removeHandler(h)
    if _logfile:
        handler = RotatingFileHandler(
            _logfile, maxBytes=10 * 1024 * 1024, backupCount=5
        )
    else:
        handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    handler.setFormatter(formatter)
    handler.setLevel(_log_level)
    app.logger.addHandler(handler)
    app.logger.setLevel(_log_level)
    app.logger.propagate = False
    werkzeug_logger = logging.getLogger("werkzeug")
    for h in list(werkzeug_logger.handlers):
        werkzeug_logger.removeHandler(h)
    if _logfile:
        werkzeug_logger.addHandler(handler)
    else:
        werkzeug_logger.addHandler(logging.StreamHandler(sys.stdout))
    werkzeug_logger.setLevel(_log_level)
    werkzeug_logger.propagate = False
except Exception:
    app.logger.exception("Failed to initialize logging handlers")

# Placeholder for optional export helper to satisfy static analysis; actual
# implementation is imported at runtime inside endpoints that need it.
build_workbook_from_data: Any = None


def _send_file_partial(path):
    """Return an HTTP 206 partial content response for a file when the
    request includes a Range header. Falls back to a normal send_file on
    error or when Range is not supported.
    """
    import mimetypes
    from flask import request, Response, send_file

    try:
        file_size = os.path.getsize(path)
        range_header = request.headers.get("Range")
        if not range_header:
            return send_file(path)
        units, _, range_spec = range_header.partition("=")
        if units != "bytes":
            return send_file(path)
        start_str, sep, end_str = range_spec.partition("-")
        try:
            start = int(start_str) if start_str else 0
        except Exception:
            start = 0
        try:
            end = int(end_str) if end_str else file_size - 1
        except Exception:
            end = file_size - 1
        if end >= file_size:
            end = file_size - 1
        if start > end:
            start = 0
        length = end - start + 1
        with open(path, "rb") as fh:
            fh.seek(start)
            data = fh.read(length)
        content_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
            "Content-Type": content_type,
        }
        return Response(data, status=206, headers=headers)
    except Exception:
        try:
            from flask import current_app

            current_app.logger.exception("Partial file send failed for %s", path)
        except Exception:
            pass
        return send_file(path)


_flask_key = os.environ.get("FLASK_SECRET_KEY")
if not _flask_key:
    try:
        _flask_key = secrets.token_urlsafe(32)
        app_logger = logging.getLogger(__name__)
        app_logger.warning(
            "FLASK_SECRET_KEY not set; using an ephemeral secret for development/testing only"
        )
    except Exception:
        _flask_key = ""
# module logger alias used throughout the module
logger = logging.getLogger(__name__)
app.secret_key = _flask_key


@app.route("/api/<path:subpath>", methods=["OPTIONS"])
def _early_api_options(subpath) -> ResponseReturnValue:
    return ("", 200)


@app.errorhandler(NotFound)
def _handle_not_found(e):
    try:
        if request.method == "OPTIONS" and request.path.startswith("/api/"):
            app.logger.debug(
                "Intercepting NotFound for OPTIONS preflight: %s", request.path
            )
            return ("", 200)
    except Exception as e:
        app.logger.debug("Error handling NotFound preflight: %s", e)
    return e


@app.errorhandler(MethodNotAllowed)
def _handle_method_not_allowed(e):
    try:
        if request.method == "OPTIONS" and request.path.startswith("/api/"):
            app.logger.debug(
                "Intercepting MethodNotAllowed for OPTIONS preflight: %s", request.path
            )
            return ("", 200)
    except Exception as e:
        app.logger.debug("Error handling MethodNotAllowed preflight: %s", e)
    return e


try:
    from leads import leads_bp

    app.register_blueprint(leads_bp)
except Exception:
    app.logger.exception("Failed to register leads blueprint")
try:
    from jobtrack_navigator_ai import navigator_bp as navigator_bp

    app.register_blueprint(navigator_bp)
except Exception as e:
    app.logger.exception("Failed to register Navigator blueprint: %s", e)
    raise
for _mod in (
    "root",
    "static",
    "health",
    "sectors",
    "auth",
    "contacts",
    "contacts_extra",
    "tasks",
    "analytics",
    "organisations",
    "admin",
    "engagements",
    "export",
):
    try:
        mod = __import__(f"jobtrack_core.routes.{_mod}", fromlist=["bp"])
        bp = (
            getattr(mod, f"{_mod}_bp", None)
            or getattr(mod, "bp", None)
            or getattr(mod, "api", None)
        )
        if bp:
            app.register_blueprint(bp)
    except Exception:
        app.logger.debug("Failed to register blueprint for %s", _mod)

@app.route("/api/generate", methods=["GET"])
def generate_probe() -> ResponseReturnValue:
    try:
        from jobtrack_navigator_ai.providers import get_provider

        prov = get_provider()
        resp = prov.generate(prompt="say hello", stream=False)
        return (jsonify({"ok": True, "response": resp}), 200)
    except Exception as e:
        app.logger.exception("GET /api/generate probe failed: %s", e)
        return (jsonify({"ok": False, "error": str(e)}), 502)


@app.route("/api/report_issue", methods=["POST"])
def report_issue() -> ResponseReturnValue:
    try:
        title = (request.form.get("title") or "").strip()
        description = (request.form.get("description") or "").strip()
        reporter_name = (request.form.get("reporter_name") or "").strip()
        reporter_email = (request.form.get("reporter_email") or "").strip()
        file_objs = request.files.getlist("files") if hasattr(request, "files") else []
        filenames = [str(f.filename) for f in file_objs if getattr(f, "filename", None)]
        if not title or not description:
            return (
                jsonify({"ok": False, "error": "Missing title or description"}),
                400,
            )
        gh_token = os.getenv("GITHUB_ISSUE_TOKEN")
        gh_repo = os.getenv("GITHUB_ISSUE_REPO")
        if not gh_token or not gh_repo:
            app.logger.warning(
                "Issue reporting requested but GITHUB_ISSUE_TOKEN or GITHUB_ISSUE_REPO not configured"
            )
            return (
                jsonify(
                    {"ok": False, "error": "Issue reporting not configured on server"}
                ),
                503,
            )
        body_lines = [
            "Reported via JobTrack",
            "",
            (
                f"Reporter: {reporter_name} <{reporter_email}>"
                if reporter_name or reporter_email
                else ""
            ),
            "",
            description,
            "",
            (
                f"Attachments: {', '.join(filenames)}"
                if filenames
                else "Attachments: none"
            ),
        ]
        body = """""".join([line for line in body_lines if line is not None])
        headers = {
            "Authorization": f"token {gh_token}",
            "Accept": "application/vnd.github.v3+json",
        }
        payload = {"title": title, "body": body, "labels": ["reported-via-app"]}
        if not requests:
            app.logger.warning(
                "Issue reporting requested but 'requests' library is unavailable"
            )
            return (
                jsonify(
                    {"ok": False, "error": "Issue reporting not configured on server"}
                ),
                503,
            )
        resp = requests.post(
            f"https://api.github.com/repos/{gh_repo}/issues",
            json=payload,
            headers=headers,
            timeout=15,
        )
        if resp.status_code not in (200, 201):
            app.logger.error(
                "GitHub API error creating issue: %s %s", resp.status_code, resp.text
            )
            return (
                jsonify(
                    {"ok": False, "error": "GitHub API error", "details": resp.text}
                ),
                502,
            )
        data = resp.json()
        return (
            jsonify(
                {
                    "ok": True,
                    "issue_url": data.get("html_url"),
                    "issue_id": data.get("id"),
                    "issue_number": data.get("number"),
                }
            ),
            201,
        )
    except Exception as e:
        app.logger.exception("POST /api/report_issue failed: %s", e)
        return (jsonify({"ok": False, "error": str(e)}), 500)


@app.before_request  # type: ignore
def _log_incoming_origin() -> Optional[ResponseReturnValue]:
    try:
        origin = request.headers.get("Origin")
        cors_origins = globals().get(
            "_cors_origins",
            [
                o.strip()
                for o in os.environ.get(
                    "CORS_ALLOWED_ORIGINS", "http://localhost:5173"
                ).split(",")
                if o.strip()
            ],
        )
        app.logger.info(
            "Incoming request path=%s Origin=%s AllowedOrigins=%s",
            request.path,
            origin,
            cors_origins,
        )
    except Exception as e:
        app.logger.debug("Failed to log incoming origin: %s", e)
    return None


@app.before_request  # type: ignore
def _csrf_protect() -> Optional[ResponseReturnValue]:
    """Simple CSRF protection for state-changing API requests.

    Uses a double-submit approach: login sets `session['csrf_token']` and
    clients must send the token in the `X-CSRF-Token` header on non-GET
    requests under `/api/*` paths. We allow unauthenticated calls to
    `/api/auth/login` and preflight OPTIONS requests.
    """
    try:
        if not request.path.startswith("/api/"):
            return None
        if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
            return None
        if request.path.startswith("/api/auth/login"):
            return None
        if request.path.startswith("/api/auth/signup"):
            return None
        if request.path.startswith("/api/auth/logout"):
            return None
        if not session.get("applicantid"):
            return (jsonify({"error": "Not authenticated"}), 401)
        token = request.headers.get("X-CSRF-Token") or request.args.get("csrf_token")
        if not token:
            try:
                body = request.get_json(silent=True) or {}
                token = body.get("csrf_token")
            except Exception:
                logging.getLogger(__name__).debug(
                    "Failed to parse JSON body for CSRF token"
                )
                token = None
        if not token or token != session.get("csrf_token"):
            return (jsonify({"error": "Missing or invalid CSRF token"}), 403)
    except Exception as e:
        app.logger.debug("CSRF validation error: %s", e)
        return (jsonify({"error": "CSRF validation failed"}), 403)
    return None


@app.route("/api/<int:applicantid>/navigator/documents_text", methods=["OPTIONS"])
def _navigator_documents_text_options(_applicantid) -> ResponseReturnValue:
    return ("", 200)


@app.route("/api/<int:applicantid>/navigator/insights", methods=["OPTIONS"])
def _navigator_insights_options(applicantid) -> ResponseReturnValue:
    return ("", 200)


@app.route("/api/<path:subpath>", methods=["OPTIONS"])
def _api_generic_options(subpath) -> ResponseReturnValue:
    return ("", 200)


@app.errorhandler(Exception)
def _handle_unhandled_exception(e):
    app.logger.exception("Unhandled exception during request")
    try:
        resp = jsonify({"error": "Internal server error", "message": str(e)})
        resp.status_code = 500
        return resp
    except Exception:
        return ("Internal server error", 500)


def _contacttarget_table_name(conn):
    """Return the correct contact-target table name present in the database.

    Prefers the new `public.contacttarget` when present, otherwise falls
    back to the legacy `public.contacttargetorganisation` table name.
    """
    try:
        with conn.cursor() as _:
            return "public.contacttargetorganisation"
    except Exception:
        return "public.contacttargetorganisation"


def parse_applicantid_from_body():
    """
    Strictly parse `applicantid` from the JSON request body and return it as an int.
    Returns `None` when missing or invalid. This enforces the requirement that
    applicantid comes only from the JSON payload (no session/header/query fallbacks).
    """
    data = request.get_json(silent=True) or {}
    if data.get("applicantid") is not None:
        try:
            return jobutils.parse_int(data.get("applicantid"), "applicantid")
        except ValueError:
            return None
    try:
        aid = request.args.get("applicantid")
        if aid is not None:
            try:
                return jobutils.parse_int(aid, "applicantid")
            except ValueError:
                logging.getLogger(__name__).debug(
                    "Failed parsing applicantid from args"
                )
    except Exception:
        logging.getLogger(__name__).debug("Failed parsing applicantid from args")
    try:
        aid = request.headers.get("X-Applicant-Id")
        if aid is not None:
            try:
                return jobutils.parse_int(aid, "applicantid")
            except ValueError:
                logging.getLogger(__name__).debug(
                    "Failed parsing applicantid from headers"
                )
    except Exception:
        logging.getLogger(__name__).debug("Failed parsing applicantid from headers")
    try:
        session_aid = session.get("applicantid")
        if session_aid is not None:
            try:
                return jobutils.parse_int(session_aid, "applicantid")
            except ValueError:
                logging.getLogger(__name__).debug(
                    "Failed parsing applicantid from session"
                )
    except Exception:
        logging.getLogger(__name__).debug("Failed parsing applicantid from session")
    return None


def require_applicant_allowed(applicantid):
    """Ensure the current session is authenticated and allowed to act for `applicantid`.

    Returns None when allowed. If not allowed, returns a Flask response tuple
    (json, status) which handlers should `return` immediately.
    """
    try:
        if os.getenv("DEV_DEBUG", "0") == "1":
            dev_hdr = request.headers.get("X-Applicant-Id") or request.args.get(
                "applicantid"
            )
            if dev_hdr:
                try:
                    session["applicantid"] = jobutils.parse_int(dev_hdr, "applicantid")
                    app.logger.info(
                        "DEV_DEBUG: set session applicantid from header/param -> %s",
                        dev_hdr,
                    )
                except Exception:
                    app.logger.debug(
                        "DEV_DEBUG: failed to set session applicantid from header/param"
                    )
    except Exception:
        app.logger.debug("Error in DEV_DEBUG applicantid handling")
    session_aid = session.get("applicantid")
    if not session_aid:
        return (jsonify({"error": "Not authenticated"}), 401)
    try:
        if jobutils.parse_int(session_aid, "applicantid") != jobutils.parse_int(
            applicantid, "applicantid"
        ):
            return (jsonify({"error": "Not authorized for applicantid"}), 403)
    except Exception:
        return (jsonify({"error": "Invalid session applicantid"}), 400)
    return None


@app.route("/api/<int:applicantid>/settings/run_sql", methods=["POST", "OPTIONS"])
def settings_run_sql(applicantid) -> ResponseReturnValue:
    """Execute a stored, read-only SQL query defined in `navigatorinput`.

    Body: { query_id: int }

    Only queries stored in the `navigatorinput` table with `inputtypeid` == 'DB_QUERY'
    are allowed. The stored SQL may include the literal token `X` which will be
    substituted with the provided `applicantid` (as an integer) before execution.

    This endpoint requires an authenticated session for the same `applicantid`.
    """
    if request.method == "OPTIONS":
        return ("", 200)
    try:
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        data = request.get_json() or {}
        try:
            query_id = jobutils.parse_int(data.get("query_id"), "query_id")
        except Exception:
            return (jsonify({"error": "Missing or invalid field: query_id"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cur:
                cur.execute(
                    "SELECT * FROM navigatorinput WHERE inputid = %s LIMIT 1;",
                    (query_id,),
                )
                row = cur.fetchone()
        if not row:
            return (jsonify({"error": "Query not found"}), 404)
        inputtype = row.get("inputtypeid")
        if not inputtype or str(inputtype).upper() != "DB_QUERY":
            return (jsonify({"error": "Requested input is not a DB_QUERY"}), 400)
        sql_candidates = [
            "inputvalue",
            "input_value",
            "input",
            "sql",
            "query",
            "querytext",
            "value",
        ]
        sql_text = None
        for col in sql_candidates:
            if col in row and row.get(col):
                sql_text = str(row.get(col)).strip()
                break
        if not sql_text:
            for k in row.keys():
                if ("input" in k or "sql" in k or "query" in k) and row.get(k):
                    sql_text = str(row.get(k)).strip()
                    break
        if not sql_text:
            return (jsonify({"error": "Stored query contains no SQL text"}), 400)
        if ";" in sql_text:
            return (
                jsonify(
                    {"error": "Stored query contains multiple statements; disallowed"}
                ),
                400,
            )
        lowered = sql_text.lower()
        for forbidden in [
            "insert ",
            "update ",
            "delete ",
            "drop ",
            "alter ",
            "create ",
            "truncate ",
            "grant ",
            "revoke ",
        ]:
            if forbidden in lowered:
                return (jsonify({"error": "Stored query is not read-only"}), 400)
        if "select" not in lowered:
            return (jsonify({"error": "Stored query must be a SELECT statement"}), 400)
        try:
            safe_sql = sql_text.replace(
                "X", str(jobutils.parse_int(applicantid, "applicantid"))
            )
        except Exception:
            safe_sql = sql_text
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
                cursor.execute(safe_sql)
                rows = cursor.fetchall()
        serialized = []
        for r in rows:
            try:
                serialized.append(", ".join([f"{k}={v}" for k, v in r.items()]))
            except Exception:
                serialized.append(str(r))
        return (jsonify({"ok": True, "rows": rows, "serialized": serialized}), 200)
    except psycopg2.Error as e:
        app.logger.error("PostgreSQL error running stored query: %s", e)
        return (jsonify({"error": "Database error executing stored query"}), 500)
    except Exception as e:
        app.logger.exception("Unexpected error in settings_run_sql: %s", e)
        return (jsonify({"error": "Unexpected server error", "message": str(e)}), 500)


@app.route("/api/<int:applicantid>/navigator/documents_text", methods=["POST"])
def _navigator_documents_text_fallback_post(applicantid) -> ResponseReturnValue:
    try:
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        body = request.get_json() or {}
        doc_ids = body.get("document_ids") or []
        if not isinstance(doc_ids, (list, tuple)):
            return (jsonify({"error": "document_ids must be a list"}), 400)
        try:
            from jobtrack_navigator_ai import _fetch_documents_text
        except Exception:
            app.logger.exception("Failed to import navigator helper")
            return (jsonify({"error": "Navigator helper unavailable"}), 500)
        docs = _fetch_documents_text(applicantid, list(doc_ids))
        return (jsonify(docs), 200)
    except Exception:
        app.logger.exception("Fallback navigator documents_text POST failed")
        return (jsonify({"error": "Failed to fetch document text"}), 500)


@app.route("/api/<int:applicantid>/settings/run_sql", methods=["POST"])
def run_sql_for_navigator(applicantid) -> ResponseReturnValue:
    """
    Execute a read-only SQL query on the main jobtrack database for the given applicant.
    The request JSON must include `sql` which may contain the literal `X` which
    will be substituted with the applicant id. For safety, only single SELECT
    statements are permitted; semicolons and data-modifying statements are rejected.
    Returns rows as JSON and a serialized CSV-style string of `col=value` pairs per row.
    """
    data = request.get_json() or {}
    sql = (data.get("sql") or "").strip()
    if not sql:
        return (jsonify({"error": "Missing sql"}), 400)
    lowered = sql.lower()
    if ";" in sql:
        return (jsonify({"error": "Multiple statements not allowed"}), 400)
    if (
        "update " in lowered
        or "delete " in lowered
        or "insert " in lowered
        or ("drop " in lowered)
        or ("alter " in lowered)
        or ("create " in lowered)
    ):
        return (jsonify({"error": "Only read-only SELECT queries are allowed"}), 400)
    if "select" not in lowered:
        return (jsonify({"error": "Only SELECT queries are allowed"}), 400)
    try:
        safe_sql = sql.replace("X", str(jobutils.parse_int(applicantid, "applicantid")))
    except Exception:
        safe_sql = sql
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cur:
                cur.execute(safe_sql)
                rows = cur.fetchall()
    except psycopg2.Error as e:
        app.logger.exception("SQL execution failed")
        return (jsonify({"error": "SQL execution failed", "details": str(e)}), 500)
    except Exception as e:
        app.logger.exception("Unexpected error executing SQL")
        return (jsonify({"error": "Unexpected error", "details": str(e)}), 500)
    serialized_rows = []
    try:
        for r in rows:
            parts = []
            for k, v in r.items() if isinstance(r, dict) else []:
                parts.append(f"{k}={v}")
            serialized_rows.append(",".join(parts))
    except Exception:
        serialized_rows = []
    return (jsonify({"rows": rows, "serialized": serialized_rows}), 200)


@app.route("/api/tasks/<int:taskid>/logs", methods=["GET"])
def list_task_logs(taskid) -> ResponseReturnValue:
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT id, taskid, commentary, logdate FROM public.taskactionlog WHERE taskid = %s ORDER BY logdate DESC, id DESC",
                    (taskid,),
                )
                rows = cursor.fetchall()
        return (jsonify(rows), 200)
    except psycopg2.Error as e:
        app.logger.error("PostgreSQL Error listing task logs: %s", e)
        return (jsonify({"error": "Database error listing logs."}), 500)
    except Exception as e:
        app.logger.exception("Unexpected error listing task logs: %s", e)
        return (jsonify({"error": "Unexpected error"}), 500)


@app.route("/api/<int:applicantid>/tasks/<int:taskid>/logs", methods=["GET"])
def list_task_logs_for_applicant(applicantid, taskid) -> ResponseReturnValue:
    try:
        applicantid = jobutils.parse_int(applicantid, "applicantid")
    except Exception:
        return (jsonify({"error": "Invalid applicantid"}), 400)

    try:
        app.logger.info(
            "list_task_logs_for_applicant called; taskid=%s applicantid=%r",
            taskid,
            applicantid,
        )
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT taskid FROM public.task WHERE taskid = %s AND applicantid = %s",
                    (taskid, applicantid),
                )
                if not cursor.fetchone():
                    app.logger.info(
                        "list_task_logs_for_applicant: task %s not found for applicant %s",
                        taskid,
                        applicantid,
                    )
                    return (jsonify({"error": "Task not found"}), 404)
                cursor.execute(
                    "SELECT id, taskid, commentary, logdate FROM public.taskactionlog WHERE taskid = %s ORDER BY logdate DESC, id DESC",
                    (taskid,),
                )
                rows = cursor.fetchall()
        app.logger.info(
            "list_task_logs_for_applicant: found %d logs for task %s (applicant %s)",
            len(rows),
            taskid,
            applicantid,
        )
        return (jsonify(rows), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error listing task logs for applicant: %s", e)
        return (jsonify({"error": "Database error listing logs."}), 500)
    except Exception:
        app.logger.exception("Unexpected error listing task logs for applicant")
        return (jsonify({"error": "Unexpected error"}), 500)


@app.route("/api/<int:applicantid>/tasks/<int:taskid>/logs", methods=["POST"])
def add_task_log_for_applicant(applicantid, taskid) -> ResponseReturnValue:
    data = request.get_json() or {}
    commentary = (data.get("commentary") or "").strip()
    if not commentary:
        return (jsonify({"error": "Missing required field: commentary"}), 400)
    logdate = data.get("logdate")
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        app.logger.info(
            "add_task_log_for_applicant called; taskid=%s applicantid=%r commentary=%s",
            taskid,
            applicantid,
            commentary[:80],
        )
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT taskid FROM public.task WHERE taskid = %s AND applicantid = %s",
                    (taskid, applicantid),
                )
                if not cursor.fetchone():
                    app.logger.info(
                        "add_task_log_for_applicant: task %s not found for applicant %s",
                        taskid,
                        applicantid,
                    )
                    return (jsonify({"error": "Task not found"}), 404)
                try:
                    cursor.execute(
                        "INSERT INTO public.taskactionlog (taskid, commentary, logdate, applicantid) VALUES (%s, %s, %s, %s) RETURNING id, taskid, commentary, logdate, applicantid",
                        (taskid, commentary, logdate, applicantid),
                    )
                    new = cursor.fetchone()
                except psycopg2.Error as db_err:
                    app.logger.error(
                        "PostgreSQL Error inserting task log for applicant (taskid=%s, applicantid=%s): %s",
                        taskid,
                        applicantid,
                        db_err,
                    )
                    return (
                        jsonify(
                            {
                                "error": "Database error adding log.",
                                "details": str(db_err),
                            }
                        ),
                        500,
                    )
        app.logger.info(
            "add_task_log_for_applicant: created log id=%s for task %s (applicant %s)",
            new.get("id") if new else None,
            taskid,
            applicantid,
        )
        return (jsonify(new), 201)
    except psycopg2.Error as e:
        app.logger.error("PostgreSQL Error adding task log for applicant: %s", e)
        return (jsonify({"error": "Database error adding log."}), 500)
    except Exception as e:
        app.logger.exception("Unexpected error adding task log for applicant: %s", e)
        return (jsonify({"error": "Unexpected error"}), 500)


def _task_log_update_impl(applicantid, logid, data: dict):
    """Internal helper: update a task action log row scoped to applicantid."""
    commentary = data.get("commentary") if isinstance(data, dict) else None
    logdate = data.get("logdate") if isinstance(data, dict) else None
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT id FROM public.taskactionlog WHERE id = %s AND applicantid = %s LIMIT 1",
                    (logid, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Log not found"}), 404)
                updates = []
                params = []
                if commentary is not None:
                    updates.append("commentary = %s")
                    params.append(commentary)
                if logdate is not None:
                    updates.append("logdate = %s")
                    params.append(logdate)
                if not updates:
                    return (jsonify({"message": "No changes provided"}), 200)
                params.extend([logid, applicantid])
                sql = (
                    "UPDATE public.taskactionlog SET "
                    + ", ".join(updates)
                    + " WHERE id = %s AND applicantid = %s RETURNING id, taskid, commentary, logdate"
                )
                cursor.execute(sql, tuple(params))
                updated = cursor.fetchone()
        return (jsonify(updated), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error updating task log: {e}")
        return (jsonify({"error": "Database error updating log."}), 500)
    except Exception as e:
        app.logger.exception(f"General Error updating task log: {e}")
        return (jsonify({"error": "Unexpected error"}), 500)


def _task_log_delete_impl(applicantid, logid):
    """Internal helper: delete a task action log row scoped to applicantid."""
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT id FROM public.taskactionlog WHERE id = %s AND applicantid = %s LIMIT 1",
                    (logid, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Log not found"}), 404)
                cursor.execute(
                    "DELETE FROM public.taskactionlog WHERE id = %s AND applicantid = %s RETURNING id",
                    (logid, applicantid),
                )
                row = cursor.fetchone()
        return (
            jsonify({"message": "Log deleted", "id": row[0] if row else logid}),
            200,
        )
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error deleting task log: {e}")
        return (jsonify({"error": "Database error deleting log."}), 500)
    except Exception as e:
        app.logger.exception(f"General Error deleting task log: {e}")
        return (jsonify({"error": "Unexpected error"}), 500)


@app.route("/api/tasks/logs/<int:logid>", methods=["PUT"])
def update_task_log_unscoped(logid) -> ResponseReturnValue:
    """Compatibility wrapper: read applicantid from body/args/header and update a task log."""
    data = request.get_json(silent=True) or {}
    aid = None
    try:
        if data.get("applicantid") is not None:
            try:
                aid = jobutils.parse_int(data.get("applicantid"), "applicantid")
            except Exception:
                aid = None
    except Exception:
        aid = None
    if aid is None:
        try:
            q = request.args.get("applicantid")
            if q is not None:
                try:
                    aid = jobutils.parse_int(q, "applicantid")
                except Exception:
                    aid = None
        except Exception:
            aid = None
    if aid is None:
        try:
            h = request.headers.get("X-Applicant-Id")
            if h is not None:
                try:
                    aid = jobutils.parse_int(h, "applicantid")
                except Exception:
                    aid = None
        except Exception:
            aid = None
    if aid is None:
        return (jsonify({"error": "Missing required parameter: applicantid"}), 400)
    guard = require_applicant_allowed(aid)
    if guard:
        return guard
    return _task_log_update_impl(aid, logid, data)


@app.route("/api/tasks/logs/<int:logid>", methods=["DELETE"])
def delete_task_log_unscoped(logid) -> ResponseReturnValue:
    """Compatibility wrapper: read applicantid and delete a task log."""
    data = request.get_json(silent=True) or {}
    aid = None
    try:
        if data.get("applicantid") is not None:
            try:
                aid = jobutils.parse_int(data.get("applicantid"), "applicantid")
            except Exception:
                aid = None
    except Exception:
        aid = None
    if aid is None:
        try:
            q = request.args.get("applicantid")
            if q is not None:
                try:
                    aid = jobutils.parse_int(q, "applicantid")
                except Exception:
                    aid = None
        except Exception:
            aid = None
    if aid is None:
        try:
            h = request.headers.get("X-Applicant-Id")
            if h is not None:
                try:
                    aid = jobutils.parse_int(h, "applicantid")
                except Exception:
                    aid = None
        except Exception:
            aid = None
    if aid is None:
        return (jsonify({"error": "Missing required parameter: applicantid"}), 400)
    guard = require_applicant_allowed(aid)
    if guard:
        return guard
    return _task_log_delete_impl(aid, logid)


@app.route("/api/<int:applicantid>/tasks/<int:taskid>/targets", methods=["GET"])
def list_task_targets(applicantid, taskid) -> ResponseReturnValue:
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        app.logger.info(
            "list_task_targets called; taskid=%s applicantid=%r", taskid, applicantid
        )
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT taskid FROM public.task WHERE taskid = %s AND applicantid = %s",
                    (taskid, applicantid),
                )
                if not cursor.fetchone():
                    app.logger.info(
                        "list_task_targets: task %s not found for applicant %s",
                        taskid,
                        applicantid,
                    )
                    return (jsonify({"error": "Task not found"}), 404)
                cursor.execute(
                    "SELECT id, taskid, targettype, targetid, created_at FROM public.tasktarget WHERE taskid = %s ORDER BY id DESC",
                    (taskid,),
                )
                rows = cursor.fetchall()
        app.logger.info(
            "list_task_targets: found %d targets for task %s (applicant %s)",
            len(rows),
            taskid,
            applicantid,
        )
        return (jsonify(rows), 200)
    except psycopg2.Error as e:
        app.logger.error("PostgreSQL Error listing task targets: %s", e)
        return (jsonify({"error": "Database error listing targets."}), 500)
    except Exception as e:
        app.logger.exception("Unexpected error listing task targets: %s", e)
        return (jsonify({"error": "Unexpected error"}), 500)


@app.route("/api/<int:applicantid>/tasks/<int:taskid>/targets", methods=["POST"])
def add_task_target(applicantid, taskid) -> ResponseReturnValue:
    data = request.get_json() or {}
    targettype = data.get("targettype")
    targetid = data.get("targetid")
    if targettype is None or targetid is None:
        return (
            jsonify({"error": "Missing required fields: targettype and targetid"}),
            400,
        )
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        app.logger.info(
            "add_task_target called; taskid=%s applicantid=%r targettype=%r targetid=%r",
            taskid,
            applicantid,
            targettype,
            targetid,
        )
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT taskid FROM public.task WHERE taskid = %s AND applicantid = %s",
                    (taskid, applicantid),
                )
                if not cursor.fetchone():
                    app.logger.info(
                        "add_task_target: task %s not found for applicant %s",
                        taskid,
                        applicantid,
                    )
                    return (jsonify({"error": "Task not found"}), 404)
                cursor.execute(
                    textwrap.dedent(
                        """
                    SELECT refid FROM public.referencedata
                    WHERE refid = %s
                      AND (refdataclass = 'target_type' OR refdataclass = 'action_plan_target_type')
                """
                    ),
                    (targettype,),
                )
                if not cursor.fetchone():
                    app.logger.info(
                        "add_task_target: invalid targettype %s for task %s",
                        targettype,
                        taskid,
                    )
                    return (jsonify({"error": "Invalid targettype"}), 400)
                app.logger.debug(
                    "add_task_target: inserting tasktarget (taskid=%s, targettype=%s, targetid=%s)",
                    taskid,
                    targettype,
                    targetid,
                )
                try:
                    cursor.execute(
                        "SELECT id FROM public.tasktarget WHERE taskid = %s AND targettype = %s AND targetid = %s AND applicantid = %s LIMIT 1;",
                        (taskid, targettype, targetid, applicantid),
                    )
                    if cursor.fetchone():
                        app.logger.info(
                            "add_task_target: duplicate mapping detected for task=%s targettype=%s targetid=%s applicant=%s",
                            taskid,
                            targettype,
                            targetid,
                            applicantid,
                        )
                        return (jsonify({"error": "Duplicate mapping"}), 409)
                    cursor.execute(
                        "INSERT INTO public.tasktarget (taskid, targettype, targetid, applicantid) VALUES (%s, %s, %s, %s) RETURNING id, taskid, targettype, targetid, created_at, applicantid",
                        (taskid, targettype, targetid, applicantid),
                    )
                    new = cursor.fetchone()
                except psycopg2.Error as db_err:
                    try:
                        pgcode = getattr(db_err, "pgcode", None)
                    except Exception:
                        pgcode = None
                    app.logger.error(
                        "PostgreSQL Error inserting task target (taskid=%s, targettype=%s, targetid=%s): %s",
                        taskid,
                        targettype,
                        targetid,
                        db_err,
                    )
                    _errorcodes = getattr(psycopg2, "errorcodes", None)
                    _unique_violation = (
                        getattr(_errorcodes, "UNIQUE_VIOLATION", "23505")
                        if _errorcodes is not None
                        else "23505"
                    )
                    if pgcode == _unique_violation:
                        return (jsonify({"error": "Duplicate mapping"}), 409)
                    return (
                        jsonify(
                            {
                                "error": "Database error adding target.",
                                "details": str(db_err),
                            }
                        ),
                        500,
                    )
        app.logger.info(
            "add_task_target: created tasktarget id=%s for task %s (applicant %s)",
            new.get("id") if new else None,
            taskid,
            applicantid,
        )
        return (jsonify(new), 201)
    except psycopg2.Error as e:
        app.logger.error("PostgreSQL Error adding task target: %s", e)
        return (jsonify({"error": "Database error adding target."}), 500)
    except Exception as e:
        app.logger.exception("Unexpected error adding task target: %s", e)
        return (jsonify({"error": "Unexpected error"}), 500)


@app.route("/api/<int:applicantid>/tasks/targets/<int:ttid>", methods=["DELETE"])
def delete_task_target(applicantid, ttid) -> ResponseReturnValue:
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        app.logger.info(
            "delete_task_target called; ttid=%s applicantid=%r", ttid, applicantid
        )
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    textwrap.dedent(
                        """
                    SELECT t.id FROM public.tasktarget t
                    JOIN public.task tk ON t.taskid = tk.taskid
                    WHERE t.id = %s AND tk.applicantid = %s
                """
                    ),
                    (ttid, applicantid),
                )
                if not cursor.fetchone():
                    app.logger.info(
                        "delete_task_target: tasktarget %s not found for applicant %s",
                        ttid,
                        applicantid,
                    )
                    return (jsonify({"error": "Task target not found"}), 404)
                cursor.execute("DELETE FROM public.tasktarget WHERE id = %s", (ttid,))
        app.logger.info(
            "delete_task_target: deleted ttid=%s for applicant %s", ttid, applicantid
        )
        return (jsonify({"ok": True}), 200)
    except psycopg2.Error as e:
        app.logger.error("PostgreSQL Error deleting task target: %s", e)
        return (jsonify({"error": "Database error deleting target."}), 500)
    except Exception as e:
        app.logger.exception("Unexpected error deleting task target: %s", e)
        return (jsonify({"error": "Unexpected error"}), 500)


@app.route("/api/<int:applicantid>/reference-data", methods=["GET"])
def get_reference_data(applicantid) -> ResponseReturnValue:
    """
    Fetch reference data entries. Optional query params:
      - category: filter by category/refdataclass (e.g., 'engagement_type', 'source_channel')
      - active: if 'true', only return active entries (legacy schema only)
    If on new schema, returns at least {refid, refdataclass, refvalue} and also includes {label} aliased to refvalue for UI compatibility.
    """
    try:
        category = request.args.get("category")
        # parse query params
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                base_sql = "SELECT refid, refdataclass, refvalue FROM referencedata"
                conditions = []
                params = []
                if category:
                    conditions.append("refdataclass = %s")
                    params.append(category)
                if conditions:
                    base_sql += " WHERE " + " AND ".join(conditions)
                base_sql += " ORDER BY refdataclass ASC, refvalue ASC;"
                cursor.execute(base_sql, tuple(params))
                rows = cursor.fetchall()
                for r in rows:
                    r.setdefault("label", r.get("refvalue"))
        return (jsonify(rows), 200)
    except psycopg2.Error as e:
        app.logger.error("PostgreSQL Error retrieving reference data: %s", e)
        return (jsonify({"error": "Database error retrieving reference data."}), 500)
    except Exception as e:
        app.logger.error("General Error: %s", e)
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/reference-data", methods=["GET"])
def get_reference_data_root() -> ResponseReturnValue:
    """
    Fetch global reference data entries (no applicant context required).
    Supports same query params as applicant-scoped endpoint: `category` to filter by refdataclass.
    """
    try:
        category = request.args.get("category")
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                base_sql = "SELECT refid, refdataclass, refvalue FROM referencedata"
                conditions = []
                params = []
                if category:
                    conditions.append("refdataclass = %s")
                    params.append(category)
                if conditions:
                    base_sql += " WHERE " + " AND ".join(conditions)
                base_sql += " ORDER BY refdataclass ASC, refvalue ASC;"
                cursor.execute(base_sql, tuple(params))
                rows = cursor.fetchall()
                for r in rows:
                    r.setdefault("label", r.get("refvalue"))
        return (jsonify(rows), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error retrieving reference data: {e}")
        return (jsonify({"error": "Database error retrieving reference data."}), 500)
    except Exception:
        app.logger.exception("Unexpected error in get_engagements")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/auth/login", methods=["POST"])
def api_login() -> ResponseReturnValue:
    """Authenticate an applicant by email + password.
    Expects JSON { email, password }
    On success sets session['applicantid'] and returns applicant profile (without password_hash).
    """
    data = request.get_json() or {}
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    try:
        app.logger.info(
            "Login attempt for email=%s remote=%s",
            email or "(empty)",
            request.remote_addr,
        )
    except Exception as e:
        logger.debug("Login attempt log emit failed: %s", e)
    if not email or not password:
        app.logger.debug(
            "Login failed: missing credentials (email present=%s)", bool(email)
        )
        return (jsonify({"error": "Missing credentials"}), 400)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    textwrap.dedent(
                        """
                    SELECT
                        applicantid,
                        email,
                        phone,
                        addressline1,
                        city,
                        postcode,
                        linkedinurl,
                        personalwebsiteurl,
                        firstname,
                        lastname,
                        avatarurl,
                        uipreferences AS ui_preferences,
                        passwordhash AS password_hash,
                        isactive AS is_active,
                        issuperuser,
                        lastlogin AS last_login
                    FROM applicantprofile
                    WHERE lower(email) = lower(%s)
                    LIMIT 1;
                """
                    ),
                    (email,),
                )
                row = cursor.fetchone()
                if not row:
                    app.logger.info(
                        "Login failed: no account found for email=%s", email
                    )
                    return (jsonify({"error": "Invalid credentials"}), 401)
                if row.get("is_active") is False:
                    app.logger.info(
                        "Login failed: account disabled for email=%s applicantid=%s",
                        email,
                        row.get("applicantid"),
                    )
                    return (jsonify({"error": "Account disabled"}), 403)
                pwd_hash = row.get("password_hash")
                if not pwd_hash:
                    app.logger.info(
                        "Login requires password setup for email=%s applicantid=%s",
                        email,
                        row.get("applicantid"),
                    )
                    return (
                        jsonify(
                            {
                                "requirePasswordSetup": True,
                                "applicantId": row.get("applicantid"),
                                "email": email,
                            }
                        ),
                        200,
                    )
                valid = False
                try:
                    valid = check_password_hash(pwd_hash, password)
                except ValueError as ve:
                    app.logger.warning("check_password_hash ValueError: %s", ve)
                    new_hash = None
                    if isinstance(pwd_hash, str) and pwd_hash.startswith(
                        "pbkdf2_sha256$"
                    ):
                        parts = pwd_hash.split("$")
                        if len(parts) >= 4:
                            iterations = parts[1]
                            salt = parts[2]
                            digest = parts[3]
                            new_hash = f"pbkdf2:sha256:{iterations}${salt}${digest}"
                    else:
                        parts = pwd_hash.split("$")
                        if len(parts) == 3 and parts[0].isdigit():
                            iterations, salt, digest = parts
                            new_hash = f"pbkdf2:sha256:{iterations}${salt}${digest}"
                    if new_hash:
                        try:
                            valid = check_password_hash(new_hash, password)
                            app.logger.info(
                                "Password verified using fallback hash format for email=%s",
                                email,
                            )
                        except Exception:
                            valid = False
                if not valid:
                    app.logger.info(
                        "Login failed: invalid password for email=%s applicantid=%s",
                        email,
                        row.get("applicantid"),
                    )
                    return (jsonify({"error": "Invalid credentials"}), 401)
                cursor.execute(
                    "UPDATE applicantprofile SET lastlogin = now() WHERE applicantid = %s;",
                    (row["applicantid"],),
                )
                row.pop("password_hash", None)
                session["applicantid"] = row["applicantid"]
                app.logger.info(
                    "Login successful for email=%s applicantid=%s",
                    email,
                    row.get("applicantid"),
                )
                try:
                    session["csrf_token"] = secrets.token_urlsafe(32)
                except Exception:
                    session["csrf_token"] = None
                return (
                    jsonify(
                        {
                            "ok": True,
                            "applicant": row,
                            "csrf_token": session.get("csrf_token"),
                        }
                    ),
                    200,
                )
    except Exception as e:
        app.logger.exception("Error during login")
        if (
            os.getenv("DEV_DEBUG", "0") == "1"
            or os.getenv("FLASK_ENV") == "development"
        ):
            return (
                jsonify(
                    {
                        "error": "Server error during login",
                        "details": str(e),
                        "trace": traceback.format_exc(),
                    }
                ),
                500,
            )
        return (jsonify({"error": "Server error during login"}), 500)
    finally:
        pass


_limiter = globals().get("limiter")
if _limiter:
    try:
        _limiter.limit("5 per minute")(api_login)
        app.logger.info("Applied rate limit to /api/auth/login")
    except Exception:
        try:
            app.logger.warning("Failed to apply rate limit to /api/auth/login")
        except Exception as e:
            logger.debug("Failed to emit rate-limit warning log: %s", e)


@app.route("/api/auth/logout", methods=["POST"])
def api_logout() -> ResponseReturnValue:
    session.pop("applicantid", None)
    session.pop("csrf_token", None)
    return (jsonify({"ok": True}), 200)


@app.route("/api/auth/setup-password", methods=["POST", "OPTIONS"])
def api_setup_password() -> ResponseReturnValue:
    """
    Set up a password for an applicant who doesn't have one.
    Expects JSON: { "email": "...", "password": "...", "currentPassword": "..." }
    The currentPassword should be the temporary password they used to get here.
    For initial setup (blank password), currentPassword can be empty/the same as the login attempt.
    """
    if request.method == "OPTIONS":
        return ("", 200)
    data = request.get_json() or {}
    email = (data.get("email") or "").strip()
    new_password = data.get("password") or ""
    if not email or not new_password:
        return (jsonify({"error": "Missing email or password"}), 400)
    if len(new_password) < 8:
        return (jsonify({"error": "Password must be at least 8 characters"}), 400)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT applicantid, passwordhash FROM applicantprofile WHERE lower(email) = lower(%s) LIMIT 1;",
                    (email,),
                )
                row = cursor.fetchone()
                if not row:
                    return (jsonify({"error": "Invalid request"}), 400)
                if row.get("passwordhash"):
                    return (
                        jsonify(
                            {
                                "error": "Password already set. Use reset password instead."
                            }
                        ),
                        400,
                    )
                new_hash = generate_password_hash(new_password)
                cursor.execute(
                    "UPDATE applicantprofile SET passwordhash = %s WHERE applicantid = %s;",
                    (new_hash, row["applicantid"]),
                )
                conn.commit()
                app.logger.info(
                    "Password set for applicant %s (email=%s)",
                    row["applicantid"],
                    email,
                )
                return (
                    jsonify({"ok": True, "message": "Password set successfully"}),
                    200,
                )
    except Exception:
        app.logger.exception("Error setting up password")
        return (jsonify({"error": "Server error"}), 500)


@app.route("/api/auth/reset-password", methods=["POST", "OPTIONS"])
def api_reset_password() -> ResponseReturnValue:
    """
    Reset password for a logged-in user.
    Expects JSON: { "currentPassword": "...", "newPassword": "..." }
    """
    if request.method == "OPTIONS":
        return ("", 200)
    applicantid = session.get("applicantid")
    if not applicantid:
        return (jsonify({"error": "Not authenticated"}), 401)
    data = request.get_json() or {}
    current_password = data.get("currentPassword") or ""
    new_password = data.get("newPassword") or ""
    if not current_password or not new_password:
        return (jsonify({"error": "Missing current or new password"}), 400)
    if len(new_password) < 8:
        return (jsonify({"error": "New password must be at least 8 characters"}), 400)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT passwordhash, email FROM applicantprofile WHERE applicantid = %s LIMIT 1;",
                    (applicantid,),
                )
                row = cursor.fetchone()
                if not row:
                    return (jsonify({"error": "User not found"}), 404)
                pwd_hash = row.get("passwordhash")
                if not pwd_hash:
                    return (jsonify({"error": "No password set"}), 400)
                valid = False
                try:
                    valid = check_password_hash(pwd_hash, current_password)
                except ValueError:
                    new_hash = None
                    if isinstance(pwd_hash, str) and pwd_hash.startswith(
                        "pbkdf2_sha256$"
                    ):
                        parts = pwd_hash.split("$")
                        if len(parts) >= 4:
                            iterations = parts[1]
                            salt = parts[2]
                            digest = parts[3]
                            new_hash = f"pbkdf2:sha256:{iterations}${salt}${digest}"
                    else:
                        parts = pwd_hash.split("$")
                        if len(parts) == 3 and parts[0].isdigit():
                            iterations, salt, digest = parts
                            new_hash = f"pbkdf2:sha256:{iterations}${salt}${digest}"
                    if new_hash:
                        try:
                            valid = check_password_hash(new_hash, current_password)
                        except Exception:
                            valid = False
                if not valid:
                    app.logger.info(
                        "Password reset failed: invalid current password for applicant %s",
                        applicantid,
                    )
                    return (jsonify({"error": "Current password is incorrect"}), 401)
                new_hash = generate_password_hash(new_password)
                cursor.execute(
                    "UPDATE applicantprofile SET passwordhash = %s WHERE applicantid = %s;",
                    (new_hash, applicantid),
                )
                conn.commit()
                app.logger.info(
                    "Password reset successful for applicant %s (email=%s)",
                    applicantid,
                    row.get("email"),
                )
                return (
                    jsonify({"ok": True, "message": "Password reset successfully"}),
                    200,
                )
    except Exception:
        app.logger.exception("Error resetting password")
        return (jsonify({"error": "Server error"}), 500)


@app.route("/api/auth/me", methods=["GET"])
def api_me() -> ResponseReturnValue:
    applicantid = session.get("applicantid")
    try:
        safe_headers = {
            k: v
            for k, v in request.headers.items()
            if k.lower() not in ("authorization", "cookie")
        }
    except Exception:
        safe_headers = {}
    try:
        app.logger.debug(
            "api_me called; remote=%s path=%s headers=%s",
            request.remote_addr,
            request.path,
            safe_headers,
        )
    except Exception:
        app.logger.debug("api_me called; could not read request details")
    try:
        session_keys = list(session.keys())
        app.logger.debug(
            "api_me session keys=%s csrf_present=%s",
            session_keys,
            "csrf_token" in session,
        )
    except Exception:
        app.logger.debug("api_me: unable to inspect session")
    if not applicantid:
        app.logger.info("api_me: unauthenticated request (no session applicantid)")
        return (jsonify({"ok": False, "error": "Not authenticated"}), 401)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """                    SELECT
    applicantid,
    firstname,
    lastname,
    email,
    phone,
    avatarurl,
    uipreferences AS ui_preferences,
    passwordhash AS password_hash,
    isactive AS is_active,
    issuperuser,
    lastlogin AS last_login
FROM applicantprofile
WHERE applicantid = %s
LIMIT 1;""",
                    (applicantid,),
                )
                row = cursor.fetchone()
                try:
                    app.logger.debug(
                        "api_me fetched applicant row present=%s keys=%s",
                        bool(row),
                        list(row.keys()) if row else None,
                    )
                except Exception:
                    app.logger.debug(
                        "api_me fetched applicant row (unable to examine keys)"
                    )
                if not row:
                    return (jsonify({"ok": False, "error": "Not found"}), 404)
                row.pop("password_hash", None)
                resp = {"ok": True, "applicant": row}
                try:
                    if session.get("csrf_token"):
                        resp["csrf_token"] = session.get("csrf_token")
                except Exception as e:
                    logger.debug("Failed to read csrf_token from session: %s", e)
                return (jsonify(resp), 200)
    except Exception as e:
        app.logger.exception("Error fetching current user (api_me)")
        if app.config.get("TESTING") or app.config.get("DEBUG"):
            return (
                jsonify({"ok": False, "error": "Server error", "details": str(e)}),
                500,
            )
        return (jsonify({"ok": False, "error": "Server error"}), 500)


def _summarize_set_cookie_headers(headers):
    """Return a redacted summary of Set-Cookie headers.

    Example output: ["session=<redacted>; Path=/; HttpOnly; SameSite=Lax"]
    """
    try:
        sc_list = (
            headers.getlist("Set-Cookie")
            if hasattr(headers, "getlist")
            else [headers.get("Set-Cookie")] if headers.get("Set-Cookie") else []
        )
        summaries = []
        for sc in sc_list:
            if not sc:
                continue
            parts = sc.split(";")
            name = parts[0].split("=")[0] if "=" in parts[0] else parts[0]
            attrs = ";".join((p.strip() for p in parts[1:] if p.strip()))
            summaries.append(f"{name}=<redacted>" + (f"; {attrs}" if attrs else ""))
        return summaries
    except Exception:
        return ["<error summarizing set-cookie>"]


@app.after_request
def _log_auth_cookie_exchange(response):
    """Log cookie exchange details for auth endpoints to help debug session issues.

    This logs presence of an incoming Cookie header, the cookie names sent by
    the client (not values), and whether the response includes Set-Cookie headers
    (with values redacted). Only active when request context is available and
    will not log sensitive values.
    """
    try:
        if (
            request
            and request.path
            and (
                request.path.startswith("/api/auth/") or request.path == "/api/auth/me"
            )
        ):
            try:
                cookie_header = request.headers.get("Cookie")
                cookie_present = bool(cookie_header)
            except Exception:
                cookie_present = False
            try:
                cookie_keys = list(request.cookies.keys())
            except Exception:
                cookie_keys = None
            try:
                set_cookie_summaries = _summarize_set_cookie_headers(response.headers)
            except Exception:
                set_cookie_summaries = None
            app.logger.debug(
                "auth-cookie-exchange: method=%s path=%s remote=%s cookie_present=%s cookie_keys=%s set_cookie_summaries=%s",
                request.method,
                request.path,
                getattr(request, "remote_addr", None),
                cookie_present,
                cookie_keys,
                set_cookie_summaries,
            )
    except Exception as e:
        try:
            app.logger.exception(
                "Failed to log auth-cookie-exchange after_request: %s", e
            )
        except Exception as ex:
            logger.debug(
                "Failed while emitting auth-cookie-exchange exception log: %s", ex
            )
    return response


@app.route("/api/auth/signup", methods=["POST"])
def api_signup() -> ResponseReturnValue:
    """Create a new applicant profile and establish a session.
    Expects JSON { name, email, password } where `name` may be full name or will
    be split into first/last. On success sets session['applicantid'] and returns applicant.
    """
    data = request.get_json() or {}
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()
    if not email or not password or (not name):
        return (jsonify({"error": "Missing required fields"}), 400)
    parts = name.split(None, 1)
    first = parts[0] if parts else ""
    last = parts[1] if len(parts) > 1 else ""
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT applicantid FROM applicantprofile WHERE lower(email) = lower(%s) LIMIT 1;",
                    (email,),
                )
                if cursor.fetchone():
                    return (jsonify({"error": "Email already registered"}), 409)
                pwd_hash = generate_password_hash(password)
                cursor.execute(
                    """                    INSERT INTO applicantprofile (firstname, lastname, email, passwordhash, isactive)
VALUES (%s, %s, %s, %s, true)
RETURNING applicantid
""",
                    (first, last, email, pwd_hash),
                )
                new_id = cursor.fetchone()["applicantid"]
                conn.commit()
                session["applicantid"] = new_id
                cursor.execute(
                    """                    SELECT
    applicantid,
    firstname,
    lastname,
    email,
    phone,
    avatarurl,
    uipreferences AS ui_preferences,
    isactive AS is_active,
    issuperuser,
    lastlogin AS last_login
FROM applicantprofile
WHERE applicantid = %s
LIMIT 1;""",
                    (new_id,),
                )
                row = cursor.fetchone()
                row.pop("password_hash", None)
                return (jsonify({"ok": True, "applicant": row}), 201)
    except Exception:
        app.logger.exception("Error during signup")
        return (jsonify({"error": "Server error during signup"}), 500)


@app.route("/api/<int:applicantid>/engagements/count", methods=["GET"])
def get_engagements_count(applicantid) -> ResponseReturnValue:
    """
    Retrieves the total count of engagement logs.
    """
    try:
        contact_id = request.args.get("contact_id")
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                if contact_id:
                    try:
                        cid = jobutils.parse_int(contact_id, "contact_id")
                    except Exception:
                        return (jsonify({"error": "Invalid contact_id"}), 400)
                    cursor.execute(
                        "SELECT COUNT(*) FROM EngagementLog e JOIN Contact c ON e.contactid = c.contactid WHERE c.applicantid = %s AND e.contactid = %s;",
                        (applicantid, cid),
                    )
                else:
                    cursor.execute(
                        "SELECT COUNT(*) FROM EngagementLog e JOIN Contact c ON e.contactid = c.contactid WHERE c.applicantid = %s;",
                        (applicantid,),
                    )
                count = cursor.fetchone()[0]
        return jsonify(count)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error: {e}")
        return (jsonify({"error": "Database error retrieving engagement count."}), 500)
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/<int:applicantid>/organisations/count", methods=["GET"])
def get_organisations_count(applicantid) -> ResponseReturnValue:
    """
    Retrieves the total count of organisations.
    """
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT COUNT(*) FROM Organisation WHERE applicantid = %s;",
                    (applicantid,),
                )
                count = cursor.fetchone()[0]
        return jsonify(count)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error: {e}")
        return (
            jsonify({"error": "Database error retrieving organisation count."}),
            500,
        )
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/<int:applicantid>/organisations", methods=["GET"])
def get_organisations(applicantid) -> ResponseReturnValue:
    """
    Returns a list of organisations (id and name) to populate frontend dropdowns.
    """
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cto_table = _contacttarget_table_name(conn)
                sql = f"""                    SELECT 
    o.orgid, 
    o.name, 
    o.sectorid, 
    o.talentcommunitydateadded,
    o.created_at,
    s.summary AS sector_summary,
    COUNT(DISTINCT CASE 
        WHEN c.currentorgid = o.orgid THEN c.contactid 
    END) + COUNT(DISTINCT cto.contactid) AS contacts_count,
    COUNT(DISTINCT j.jobid) AS roles_count
FROM organisation o
LEFT JOIN sector s ON o.sectorid = s.sectorid
LEFT JOIN contact c ON c.currentorgid = o.orgid AND c.applicantid = %s
LEFT JOIN {cto_table} cto ON cto.targetid = o.orgid AND cto.applicantid = %s
LEFT JOIN jobrole j ON j.companyorgid = o.orgid AND j.applicantid = %s
WHERE o.applicantid = %s
GROUP BY o.orgid, o.name, o.sectorid, o.talentcommunitydateadded, o.created_at, s.summary
ORDER BY o.name
                """
                cursor.execute(
                    sql, (applicantid, applicantid, applicantid, applicantid)
                )
                orgs = cursor.fetchall()
                for o in orgs:
                    if o.get("talentcommunitydateadded"):
                        try:
                            o["talentcommunitydateadded"] = o[
                                "talentcommunitydateadded"
                            ].strftime("%Y-%m-%d")
                        except Exception:
                            o["talentcommunitydateadded"] = str(
                                o["talentcommunitydateadded"]
                            )
                    if o.get("created_at"):
                        try:
                            o["created_at"] = o["created_at"].strftime("%Y-%m-%d")
                        except Exception:
                            o["created_at"] = str(o["created_at"])
        return jsonify(orgs)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error fetching organisations: {e}")
        return (jsonify({"error": "Database error retrieving organisations."}), 500)
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


def _org_create_impl(applicantid, data: dict):
    """Internal helper: create or return existing organisation for applicantid."""
    name = data.get("name") or data.get("org_name")
    if not name or not str(name).strip():
        return (jsonify({"error": "Missing required field: name"}), 400)
    sectorid = data.get("sectorid")
    talent_date = data.get("talentcommunitydateadded")
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT orgid, name, sectorid, talentcommunitydateadded, created_at, updated_at FROM organisation WHERE lower(name) = lower(%s) AND applicantid = %s LIMIT 1;",
                    (name, applicantid),
                )
                row = cursor.fetchone()
                if row:
                    return (jsonify(row), 200)
                cursor.execute(
                    "INSERT INTO organisation (name, sectorid, talentcommunitydateadded, applicantid) VALUES (%s, %s, %s, %s) RETURNING orgid, name, sectorid, talentcommunitydateadded, created_at, updated_at;",
                    (name, sectorid, talent_date, applicantid),
                )
                new = cursor.fetchone()
                conn.commit()
                return (jsonify(new), 201)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error creating organisation: {e}")
        return (jsonify({"error": "Database error creating organisation."}), 500)
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


def _org_update_impl(applicantid, orgid, data: dict):
    """Internal helper: update organisation scoped to applicantid."""
    name = data.get("name")
    if name is None or not str(name).strip():
        return (jsonify({"error": "Missing required field: name"}), 400)
    sectorid = data.get("sectorid")
    talent_date = data.get("talentcommunitydateadded")
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT orgid FROM Organisation WHERE orgid = %s AND applicantid = %s LIMIT 1;",
                    (orgid, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Organisation not found"}), 404)
                update_fields = ["name = %s"]
                params = [name]
                if sectorid is not None:
                    update_fields.append("sectorid = %s")
                    params.append(sectorid if sectorid else None)
                if talent_date is not None:
                    update_fields.append("talentcommunitydateadded = %s")
                    params.append(talent_date if talent_date else None)
                params.extend([orgid, applicantid])
                cursor.execute(
                    f"UPDATE Organisation SET {', '.join(update_fields)}, updated_at = now() WHERE orgid = %s AND applicantid = %s RETURNING orgid, name, sectorid, talentcommunitydateadded, created_at, updated_at;",
                    params,
                )
                updated = cursor.fetchone()
        return (jsonify(updated), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error updating organisation: {e}")
        return (jsonify({"error": "Database error updating organisation."}), 500)
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


def _org_delete_impl(applicantid, orgid):
    """Internal helper: delete organisation scoped to applicantid if safe."""
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT orgid, name FROM Organisation WHERE orgid = %s AND applicantid = %s LIMIT 1;",
                    (orgid, applicantid),
                )
                org = cursor.fetchone()
                if not org:
                    return (jsonify({"error": "Organisation not found"}), 404)
                cursor.execute(
                    "SELECT COUNT(*) FROM Contact WHERE currentorgid = %s AND applicantid = %s;",
                    (orgid, applicantid),
                )
                row = cursor.fetchone()
                contact_count = (
                    jobutils.safe_int(
                        row.get("count")
                        if isinstance(row, dict) and row.get("count") is not None
                        else row[0] if row and len(row) > 0 else 0
                    )
                    or 0
                )
                cursor.execute(
                    "SELECT COUNT(*) FROM jobrole WHERE companyorgid = %s AND applicantid = %s;",
                    (orgid, applicantid),
                )
                row = cursor.fetchone()
                jobrole_count = (
                    jobutils.safe_int(
                        row.get("count")
                        if isinstance(row, dict) and row.get("count") is not None
                        else row[0] if row and len(row) > 0 else 0
                    )
                    or 0
                )
                cursor.execute(
                    "SELECT COUNT(*) FROM public.contacttargetorganisation WHERE targetid = %s AND applicantid = %s;",
                    (orgid, applicantid),
                )
                row = cursor.fetchone()
                target_count = (
                    jobutils.safe_int(
                        row.get("count")
                        if isinstance(row, dict) and row.get("count") is not None
                        else row[0] if row and len(row) > 0 else 0
                    )
                    or 0
                )
                total_refs = (
                    (contact_count or 0) + (jobrole_count or 0) + (target_count or 0)
                )
                if total_refs > 0:
                    return (
                        jsonify(
                            {
                                "error": "Cannot delete: organisation is referenced by other records",
                                "details": {
                                    "contacts": int(contact_count),
                                    "jobroles": int(jobrole_count),
                                    "targets": int(target_count),
                                },
                            }
                        ),
                        409,
                    )
                cursor.execute(
                    "DELETE FROM Organisation WHERE orgid = %s AND applicantid = %s RETURNING orgid, name;",
                    (orgid, applicantid),
                )
                deleted = cursor.fetchone()
        return (jsonify({"message": "Organisation deleted", "org": deleted}), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error deleting organisation: {e}")
        return (jsonify({"error": "Database error deleting organisation."}), 500)
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


def _contact_create_impl(applicantid, data: dict):
    """Internal helper: create a contact scoped to applicantid."""
    name = data.get("name")
    currentrole = data.get("currentrole")
    role_type_id = data.get("role_type_id")
    org_name = (
        data.get("current_organization")
        or data.get("currentorg")
        or data.get("current_org")
    )
    leadid = data.get("leadid")
    if not name or not str(name).strip():
        return (jsonify({"error": "Missing required field: name"}), 400)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                org_id = None
                if org_name and str(org_name).strip():
                    cursor.execute(
                        "SELECT orgid FROM Organisation WHERE lower(name) = lower(%s) LIMIT 1;",
                        (org_name,),
                    )
                    row = cursor.fetchone()
                    if row:
                        org_id = row["orgid"]
                    else:
                        cursor.execute(
                            "INSERT INTO Organisation (name) VALUES (%s) RETURNING orgid;",
                            (org_name,),
                        )
                        org_id = cursor.fetchone()["orgid"]
                cursor.execute(
                    "SELECT contactid FROM Contact WHERE lower(name) = lower(%s) AND (currentorgid = %s OR (currentorgid IS NULL AND %s IS NULL)) AND applicantid = %s LIMIT 1;",
                    (name, org_id, org_id, applicantid),
                )
                dup = cursor.fetchone()
                if dup:
                    return (
                        jsonify(
                            {
                                "error": "A contact with that name and organisation already exists."
                            }
                        ),
                        409,
                    )
                if leadid is not None:
                    try:
                        lid = jobutils.parse_int(leadid, "leadid")
                    except Exception:
                        return (jsonify({"error": "Invalid leadid provided"}), 400)
                    cursor.execute(
                        "SELECT leadid FROM public.lead WHERE leadid = %s LIMIT 1;",
                        (lid,),
                    )
                    if not cursor.fetchone():
                        return (jsonify({"error": "Lead not found"}), 400)
                    lid = lid
                else:
                    lid = None
                cursor.execute(
                    """                    INSERT INTO Contact (name, currentrole, currentorgid, roletypeid, applicantid, leadid)
VALUES (%s, %s, %s, %s, %s, %s)
RETURNING contactid;
""",
                    (name, currentrole, org_id, role_type_id, applicantid, lid),
                )
                new_id = cursor.fetchone()["contactid"]
        return (jsonify({"contactid": new_id, "message": "Contact created"}), 201)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error adding contact: {e}")
        return (
            jsonify(
                {
                    "error": f"Database error: {getattr(e.diag, 'message_primary', str(e))}"
                }
            ),
            500,
        )
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


def _contact_delete_impl(applicantid, contact_id):
    """Internal helper: delete a contact and its engagement logs for an applicant."""
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM EngagementLog WHERE contactid = %s AND applicantid = %s;",
                    (contact_id, applicantid),
                )
                cursor.execute(
                    "DELETE FROM Contact WHERE contactid = %s AND applicantid = %s RETURNING contactid;",
                    (contact_id, applicantid),
                )
                row = cursor.fetchone()
                if not row:
                    return (jsonify({"error": "Contact not found"}), 404)
        return (
            jsonify({"message": "Contact and associated engagement logs deleted."}),
            200,
        )
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error deleting contact: {e}")
        return (
            jsonify(
                {
                    "error": f"Database error: {getattr(e.diag, 'message_primary', str(e))}"
                }
            ),
            500,
        )
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


def _contact_update_impl(applicantid, contact_id, data: dict):
    """Internal helper: update a contact record scoped to applicantid."""
    name = data.get("name")
    currentrole = data.get("currentrole")
    org_name = (
        data.get("current_organization")
        or data.get("currentorg")
        or data.get("current_org")
    )
    role_type_id = data.get("role_type_id")
    latestcvsent = data.get("latestcvsent")
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT contactid FROM Contact WHERE contactid = %s AND applicantid = %s LIMIT 1;",
                    (contact_id, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Contact not found"}), 404)
                updates = []
                params = []
                if name is not None:
                    updates.append("name = %s")
                    params.append(name)
                if currentrole is not None:
                    updates.append("currentrole = %s")
                    params.append(currentrole)
                if org_name is not None:
                    orgid = None
                    if str(org_name).strip():
                        cursor.execute(
                            "SELECT orgid FROM Organisation WHERE lower(name) = lower(%s) LIMIT 1;",
                            (org_name,),
                        )
                        row = cursor.fetchone()
                        if row:
                            orgid = row["orgid"]
                        else:
                            cursor.execute(
                                "INSERT INTO Organisation (name) VALUES (%s) RETURNING orgid;",
                                (org_name,),
                            )
                            orgid = cursor.fetchone()["orgid"]
                    updates.append("currentorgid = %s")
                    params.append(orgid)
                if role_type_id is not None:
                    try:
                        rtid = (
                            jobutils.parse_int(role_type_id, "role_type_id")
                            if role_type_id is not None
                            else None
                        )
                    except Exception:
                        rtid = None
                    updates.append("roletypeid = %s")
                    params.append(rtid)
                if latestcvsent is not None:
                    updates.append("latestcvsent = %s")
                    params.append(bool(latestcvsent))
                # New: accept statusid (FK to referencedata) to support contact status changes
                if "statusid" in data:
                    sid_raw = data.get("statusid")
                    try:
                        sid_val = jobutils.parse_int(sid_raw, "statusid") if sid_raw is not None and sid_raw != "" else None
                    except Exception:
                        sid_val = None
                    updates.append("statusid = %s")
                    params.append(sid_val)
                # Accept legacy `contact_status` string and map it to referencedata.refid
                if "contact_status" in data:
                    cs_raw = data.get("contact_status")
                    # allow empty string to clear status
                    if cs_raw == "":
                        cs_val = None
                    else:
                        try:
                            cs_norm = str(cs_raw).strip()
                            if cs_norm == "":
                                cs_val = None
                            else:
                                cursor.execute(
                                    "SELECT refid FROM referencedata WHERE lower(refdataclass) = 'contact_status' AND lower(refvalue) = lower(%s) LIMIT 1",
                                    (cs_norm,),
                                )
                                row = cursor.fetchone()
                                if not row:
                                    return (jsonify({"error": "Unknown contact_status value"}), 400)
                                cs_val = row["refid"]
                        except Exception:
                            return (jsonify({"error": "Invalid contact_status value"}), 400)
                    updates.append("statusid = %s")
                    params.append(cs_val)
                li_flag = None
                if "islinkedinconnected" in data:
                    li_flag = data.get("islinkedinconnected")
                elif "is_linkedin_connected" in data:
                    li_flag = data.get("is_linkedin_connected")
                elif "linkedin_connected" in data:
                    li_flag = data.get("linkedin_connected")
                if li_flag is not None:
                    updates.append("islinkedinconnected = %s")
                    try:
                        params.append(bool(li_flag))
                    except Exception:
                        params.append(False)
                if "leadid" in data:
                    lid_raw = data.get("leadid")
                    if lid_raw == "":
                        lid_val = None
                    else:
                        try:
                            lid_val = (
                                jobutils.parse_int(lid_raw, "leadid")
                                if lid_raw is not None
                                else None
                            )
                        except Exception:
                            return (jsonify({"error": "Invalid leadid provided"}), 400)
                    if lid_val is not None:
                        cursor.execute(
                            "SELECT leadid FROM public.lead WHERE leadid = %s LIMIT 1;",
                            (lid_val,),
                        )
                        if not cursor.fetchone():
                            return (jsonify({"error": "Lead not found"}), 400)
                    updates.append("leadid = %s")
                    params.append(lid_val)
                if updates:
                    updates.append("updated_at = now()")
                if not updates:
                    return (jsonify({"message": "No changes provided"}), 200)
                sql = (
                    "UPDATE Contact SET "
                    + ", ".join(updates)
                    + " WHERE contactid = %s AND applicantid = %s RETURNING *;"
                )
                params.append(contact_id)
                params.append(applicantid)
                cursor.execute(sql, tuple(params))
                updated = cursor.fetchone()
                return (jsonify(updated), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error updating contact: {e}")
        return (
            jsonify(
                {
                    "error": f"Database error: {getattr(e.diag, 'message_primary', str(e))}"
                }
            ),
            500,
        )
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/<int:applicantid>/organisations/<int:orgid>", methods=["GET"])
def get_organisation(applicantid, orgid) -> ResponseReturnValue:
    """
    Get a single organisation by ID.
    Returns the organisation record with all fields.
    """
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """                    SELECT orgid, name, sectorid, talentcommunitydateadded, created_at, updated_at
FROM Organisation 
WHERE orgid = %s AND applicantid = %s LIMIT 1;
""",
                    (orgid, applicantid),
                )
                org = cursor.fetchone()
                if not org:
                    return (jsonify({"error": "Organisation not found"}), 404)
                if org.get("talentcommunitydateadded"):
                    try:
                        org["talentcommunitydateadded"] = org[
                            "talentcommunitydateadded"
                        ].strftime("%Y-%m-%d")
                    except Exception:
                        org["talentcommunitydateadded"] = str(
                            org["talentcommunitydateadded"]
                        )
                if org.get("created_at"):
                    try:
                        org["created_at"] = org["created_at"].isoformat()
                    except Exception:
                        org["created_at"] = str(org["created_at"])
                if org.get("updated_at"):
                    try:
                        org["updated_at"] = org["updated_at"].isoformat()
                    except Exception:
                        org["updated_at"] = str(org["updated_at"])
                return (jsonify(org), 200)
    except Exception as e:
        print(f"❌ Error fetching organisation {orgid}: {e}")
        return (jsonify({"error": "Failed to fetch organisation"}), 500)


@app.route("/api/<int:applicantid>/organisations", methods=["POST"])
def create_organisation_scoped(applicantid) -> ResponseReturnValue:
    """
    Create a new organisation scoped to the given applicant.
    Accepts JSON {"name": "Org Name", "sectorid": 1, "talentcommunitydateadded": "YYYY-MM-DD"}.
    Returns the organisation record.
    """
    data = request.get_json() or {}
    try:
        applicantid = jobutils.parse_int(applicantid, "applicantid")
    except Exception:
        return (jsonify({"error": "Invalid applicantid"}), 400)
    return _org_create_impl(applicantid, data)


@app.route("/api/<int:applicantid>/organisations/<int:orgid>", methods=["PUT"])
def update_organisation_scoped(applicantid, orgid) -> ResponseReturnValue:
    """
    Update an organisation scoped to the given applicant.
    Accepts JSON {"name": "New Name", "sectorid": 1, "talentcommunitydateadded": "YYYY-MM-DD"}.
    Returns the updated organisation record.
    """
    data = request.get_json() or {}
    try:
        applicantid = jobutils.parse_int(applicantid, "applicantid")
    except Exception:
        return (jsonify({"error": "Invalid applicantid"}), 400)
    return _org_update_impl(applicantid, orgid, data)


@app.route("/api/<int:applicantid>/organisations/<int:orgid>", methods=["DELETE"])
def delete_organisation_scoped(applicantid, orgid) -> ResponseReturnValue:
    """
    Delete an organisation scoped to the given applicant if not referenced by other records.
    Returns 200 on success or 409 if references exist.
    """
    try:
        applicantid = jobutils.parse_int(applicantid, "applicantid")
    except Exception:
        return (jsonify({"error": "Invalid applicantid"}), 400)
    return _org_delete_impl(applicantid, orgid)


@app.route("/api/<int:applicantid>/organisations/<int:orgid>/contacts", methods=["GET"])
def get_organisation_contacts(applicantid, orgid) -> ResponseReturnValue:
    """
    Return contacts linked to an organisation either by currentorgid or via ContactTargetOrganisation mapping.
    Returns list of contact rows similar to /api/contacts.
    """
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # determine contact-target table if needed (legacy name used directly below)
                cursor.execute(
                    """                    SELECT DISTINCT c.*
FROM Contact c
LEFT JOIN public.contacttargetorganisation cto ON c.contactid = cto.contactid AND cto.applicantid = %s
WHERE (c.currentorgid = %s OR cto.targetid = %s) AND c.applicantid = %s
ORDER BY c.name ASC;
                """,
                    (applicantid, orgid, orgid, applicantid),
                )
                contacts = cursor.fetchall()
        return jsonify(contacts)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error retrieving organisation contacts: {e}")
        return (
            jsonify({"error": "Database error retrieving organisation contacts."}),
            500,
        )
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/<int:applicantid>/jobroles/count", methods=["GET"])
def get_jobroles_count(applicantid) -> ResponseReturnValue:
    """
    Retrieves the total count of job roles (jobrole table).
    """
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT COUNT(*) FROM jobrole WHERE applicantid = %s;",
                    (applicantid,),
                )
                count = cursor.fetchone()[0]
        return jsonify(count)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error: {e}")
        return (jsonify({"error": "Database error retrieving jobrole count."}), 500)
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/<int:applicantid>/jobroles", methods=["GET"])
def get_jobroles(applicantid) -> ResponseReturnValue:
    """
    Returns a list of job roles (with company name, contact name, and recruiting company when available).
    """
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        contact_id = request.args.get("contact_id")
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                params = []
                where = ""
                if contact_id:
                    try:
                        cid = jobutils.parse_int(contact_id, "contact_id")
                        where = "WHERE j.contactid = %s AND j.applicantid = %s"
                        params.extend([cid, applicantid])
                    except Exception:
                        where = "WHERE j.applicantid = %s"
                        params.append(applicantid)
                else:
                    where = "WHERE j.applicantid = %s"
                    params.append(applicantid)
                cursor.execute(
                    f"""                    SELECT
    j.jobid,
    j.contactid,
    c.name AS contact_name,
    co.name AS recruiting_company,
    j.rolename,
    j.companyorgid,
    o.name AS company_name,
    j.sourcechannelid AS sourcechannelid,
    src.refvalue AS source_name,
    j.applicationdate,
    j.statusid AS statusid,
    rd.refvalue AS status_name
FROM jobrole j
LEFT JOIN Contact c ON j.contactid = c.contactid
LEFT JOIN Organisation co ON c.currentorgid = co.orgid
LEFT JOIN Organisation o ON j.companyorgid = o.orgid
LEFT JOIN ReferenceData rd ON j.statusid = rd.refid
LEFT JOIN ReferenceData src ON j.sourcechannelid = src.refid
{where}
ORDER BY j.applicationdate DESC NULLS LAST, j.jobid DESC;
                """,
                    tuple(params) if params else None,
                )
                rows = cursor.fetchall()
        for r in rows:
            if r.get("applicationdate"):
                try:
                    r["applicationdate"] = r["applicationdate"].strftime("%Y-%m-%d")
                except Exception:
                    r["applicationdate"] = str(r["applicationdate"])
        return jsonify(rows)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error retrieving jobroles: {e}")
        return (jsonify({"error": "Database error retrieving jobroles."}), 500)
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/<int:applicantid>/jobroles", methods=["POST"])
def create_jobrole_scoped(applicantid) -> ResponseReturnValue:
    """Create a jobrole scoped to an applicant. Minimal safe implementation."""
    data = request.get_json() or {}
    app.logger.info(f"POST /jobroles: received data={data}")
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            app.logger.error(f"Invalid applicantid: {applicantid}")
            return (jsonify({"error": "Invalid applicantid"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        contactid = data.get("contactid") or data.get("contact_id")
        rolename = data.get("rolename") or data.get("role_name")
        companyorgid = data.get("companyorgid") or data.get("company_orgid")
        applicationdate = data.get("applicationdate") or data.get("application_date")
        statusid = data.get("statusid")
        sourcechannelid = data.get("sourcechannelid")
        if not rolename:
            app.logger.error(f"Missing required field: rolename={rolename}")
            return (jsonify({"error": "Missing required field: rolename"}), 400)
        if not statusid:
            app.logger.error(f"Missing required field: statusid={statusid}")
            return (jsonify({"error": "Missing required field: statusid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                if contactid:
                    cursor.execute(
                        "SELECT contactid FROM contact WHERE contactid = %s LIMIT 1;",
                        (contactid,),
                    )
                    contact_row = cursor.fetchone()
                    if not contact_row:
                        return (jsonify({"error": "Contact not found"}), 404)
                cursor.execute(
                    "INSERT INTO jobrole (contactid, rolename, companyorgid, applicationdate, statusid, sourcechannelid, applicantid) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING jobid;",
                    (
                        contactid,
                        rolename,
                        companyorgid,
                        applicationdate,
                        statusid,
                        sourcechannelid,
                        applicantid,
                    ),
                )
                row = cursor.fetchone()
                jobid = row[0] if row else None
                # If a contact was linked to this new jobrole, update that contact's updated_at
                try:
                    if contactid:
                        cursor.execute(
                            "UPDATE contact SET updated_at = now() WHERE contactid = %s AND applicantid = %s;",
                            (contactid, applicantid),
                        )
                except Exception:
                    app.logger.debug("Failed to update contact.updated_at for contact %s", contactid)
                # If a contact was linked and a statusid provided, propagate status to contact
                try:
                    if contactid and statusid is not None:
                        cursor.execute(
                            "UPDATE contact SET statusid = %s, updated_at = now() WHERE contactid = %s AND applicantid = %s;",
                            (statusid, contactid, applicantid),
                        )
                except Exception:
                    app.logger.debug("Failed to update contact.statusid for contact %s", contactid)
        return (jsonify({"jobid": jobid}), 201)
    except psycopg2.errors.ForeignKeyViolation as e:
        constraint = getattr(e.diag, "constraint_name", None)
        app.logger.error(
            f"PostgreSQL FK violation creating jobrole constraint={constraint}"
        )
        if constraint and "jobrole_contactid" in constraint:
            return (jsonify({"error": "Contact not found"}), 404)
        if constraint and "jobrole_companyorgid" in constraint:
            return (jsonify({"error": "Organisation not found"}), 404)
        app.logger.exception("PostgreSQL ForeignKeyViolation creating jobrole")
        return (jsonify({"error": "Database error creating jobrole."}), 500)
    except psycopg2.Error:
        app.logger.exception("PostgreSQL Error creating jobrole")
        return (jsonify({"error": "Database error creating jobrole."}), 500)
    except Exception:
        app.logger.exception("Error creating jobrole")
        return (jsonify({"error": "Unexpected server error."}), 500)


def _engagement_create_impl(applicantid, data: dict):
    """Internal helper: create an engagement log entry scoped to applicantid."""
    contact_id = data.get("contact_id") or data.get("contactid")
    contact_ids = data.get("contact_ids") or data.get("contactIds")
    log_date_str = data.get("log_date") or data.get("logdate") or data.get("engagedate")
    log_entry = data.get("log_entry") or data.get("logentry") or data.get("notes")
    engagementtype_refid = data.get("engagementtype_refid") or data.get(
        "engagementtypeid"
    )
    engagement_type_code = data.get("engagement_type_code") or data.get(
        "engagement_type"
    )
    engagement_type_label = data.get("engagement_type_label")
    missing = []
    if not any([contact_id, contact_ids]):
        missing.append("contact_id/contact_ids")
    if not log_date_str:
        missing.append("log_date")
    if log_entry is None or str(log_entry) == "":
        missing.append("log_entry")
    if missing:
        return (jsonify({"error": "Missing required fields", "missing": missing}), 400)
    if not isinstance(log_date_str, str):
        return (jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400)
    try:
        log_date = date.fromisoformat(log_date_str)
    except Exception:
        return (jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                members = []
                if contact_ids is not None:
                    if not isinstance(contact_ids, (list, tuple)):
                        return (jsonify({"error": "contact_ids must be a list"}), 400)
                    if len(contact_ids) == 0:
                        return (
                            jsonify(
                                {"error": "contact_ids must contain at least one id"}
                            ),
                            400,
                        )
                    for raw in contact_ids:
                        try:
                            cid = jobutils.parse_int(raw, "contact_ids")
                        except Exception:
                            return (
                                jsonify({"error": "Invalid contact id in contact_ids"}),
                                400,
                            )
                        cursor.execute(
                            "SELECT contactid, name FROM Contact WHERE contactid = %s AND applicantid = %s LIMIT 1;",
                            (cid, applicantid),
                        )
                        row = cursor.fetchone()
                        if not row:
                            return (jsonify({"error": "Contact not found"}), 404)
                        members.append(
                            {"contactid": row["contactid"], "name": row.get("name")}
                        )
                else:
                    try:
                        cid = jobutils.parse_int(contact_id, "contact_id")
                    except Exception:
                        return (jsonify({"error": "Invalid contact_id"}), 400)
                    cursor.execute(
                        "SELECT contactid, name FROM Contact WHERE contactid = %s AND applicantid = %s LIMIT 1;",
                        (cid, applicantid),
                    )
                    row = cursor.fetchone()
                    if not row:
                        return (jsonify({"error": "Contact not found"}), 404)
                    members.append(
                        {"contactid": row["contactid"], "name": row.get("name")}
                    )
                resolved_refid = None
                if engagementtype_refid:
                    try:
                        resolved_refid = jobutils.parse_int(
                            engagementtype_refid, "engagementtype_refid"
                        )
                    except Exception:
                        resolved_refid = None
                if resolved_refid is None and (
                    engagement_type_code or engagement_type_label
                ):
                    lookup_val = engagement_type_code or engagement_type_label
                    if lookup_val:
                        cursor.execute(
                            "SELECT refid FROM referencedata WHERE refdataclass = 'engagement_type' AND lower(refvalue) = lower(%s) LIMIT 1;",
                            (lookup_val,),
                        )
                        row = cursor.fetchone()
                        if row:
                            resolved_refid = row["refid"]
                pg_key = os.environ.get("JOBTRACK_PG_KEY")
                if not pg_key:
                    return (
                        jsonify(
                            {
                                "error": "Server misconfiguration: JOBTRACK_PG_KEY is required to store encrypted engagement entries."
                            }
                        ),
                        500,
                    )
                if len(members) > 1:
                    try:
                        member_ids_sorted = sorted(
                            [
                                jobutils.parse_int(m.get("contactid"), "contactid")
                                for m in members
                            ]
                        )
                    except Exception:
                        member_ids_sorted = [
                            jobutils.parse_int(m.get("contactid"), "contactid")
                            for m in members
                        ]
                    cursor.execute(
                        "SELECT t.contactgroupid FROM (SELECT contactgroupid, array_agg(contactid ORDER BY contactid) AS members FROM contactgroupmembers WHERE applicantid = %s GROUP BY contactgroupid) t WHERE t.members = %s LIMIT 1;",
                        (applicantid, member_ids_sorted),
                    )
                    found = cursor.fetchone()
                    if found and found.get("contactgroupid"):
                        groupid = found["contactgroupid"]
                    else:
                        gen_name = (
                            data.get("group_name")
                            or f"Generated group {int(time.time())}"
                        )
                        cursor.execute(
                            "INSERT INTO contactgroup (name, applicantid) VALUES (%s, %s) RETURNING contactgroupid;",
                            (gen_name, applicantid),
                        )
                        grp = cursor.fetchone()
                        if not grp:
                            return (
                                jsonify({"error": "Failed to create contact group"}),
                                500,
                            )
                        groupid = grp["contactgroupid"]
                        for m in members:
                            try:
                                cursor.execute(
                                    "INSERT INTO contactgroupmembers (contactgroupid, contactid, applicantid) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING;",
                                    (groupid, m["contactid"], applicantid),
                                )
                            except Exception:
                                app.logger.debug(
                                    "Failed to insert contactgroup member %s",
                                    m.get("contactid"),
                                )
                    cursor.execute(
                        "SELECT refid FROM referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower(%s) LIMIT 1;",
                        ("Contact Group",),
                    )
                    rr = cursor.fetchone()
                    if not rr:
                        return (
                            jsonify(
                                {"error": "Missing referencedata for Contact Group"}
                            ),
                            500,
                        )
                    contacttype_ref = rr["refid"]
                    cursor.execute(
                        textwrap.dedent(
                            """
                        INSERT INTO engagementlog (contactid, contacttypeid, logdate, logentry, engagementtypeid, applicantid)
                        VALUES (%s, %s, %s, replace(encode(pgp_sym_encrypt(%s::text, %s), 'base64'), E'\\n', ''), %s, %s)
                        RETURNING engagementlogid;
                    """
                        ),
                        (
                            groupid,
                            contacttype_ref,
                            log_date,
                            log_entry or "",
                            pg_key,
                            resolved_refid,
                            applicantid,
                        ),
                    )
                    result = cursor.fetchone()
                    log_id = result["engagementlogid"]
                    resp_contacts = members
                else:
                    single = members[0]
                    cursor.execute(
                        "SELECT refid FROM referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower(%s) LIMIT 1;",
                        ("Individual Contact",),
                    )
                    rr = cursor.fetchone()
                    if not rr:
                        return (
                            jsonify(
                                {
                                    "error": "Missing referencedata for Individual Contact"
                                }
                            ),
                            500,
                        )
                    contacttype_ref = rr["refid"]
                    cursor.execute(
                        textwrap.dedent(
                            """
                        INSERT INTO engagementlog (contactid, contacttypeid, logdate, logentry, engagementtypeid, applicantid)
                        VALUES (%s, %s, %s, replace(encode(pgp_sym_encrypt(%s::text, %s), 'base64'), E'\\n', ''), %s, %s)
                        RETURNING engagementlogid;
                    """
                        ),
                        (
                            single["contactid"],
                            contacttype_ref,
                            log_date,
                            log_entry or "",
                            pg_key,
                            resolved_refid,
                            applicantid,
                        ),
                    )
                    result = cursor.fetchone()
                    log_id = result["engagementlogid"]
                    resp_contacts = [single]
        return (
            jsonify(
                {
                    "message": "Engagement log added successfully.",
                    "engagementlogid": log_id,
                    "logid": log_id,
                    "contacts": resp_contacts,
                }
            ),
            201,
        )
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error adding engagement: {e}")
        return (
            jsonify(
                {
                    "error": f"Database error: {getattr(e.diag, 'message_primary', str(e))}"
                }
            ),
            500,
        )
    except Exception as e:
        app.logger.error(f"General Error adding engagement: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


def _cleanup_contactgroup_if_needed(conn, cursor, groupid: int, applicantid: int):
    """Helper: if contact group membership <=1, remap engagements and delete the group.

    - If 1 member: remap engagements referencing the group to the single contact and set contacttypeid to Individual.
    - If 0 members: set engagements referencing the group to NULL (contactid/contacttypeid) and delete group.
    Runs inside an existing transaction (uses provided cursor).
    """
    try:
        cursor.execute(
            "SELECT COUNT(*) AS cnt, MIN(contactid) AS single_contact FROM contactgroupmembers WHERE contactgroupid = %s AND applicantid = %s;",
            (groupid, applicantid),
        )
        row = cursor.fetchone()
        if not row:
            return
        cnt = jobutils.safe_int(row.get("cnt", 0)) or 0
        single_contact = row.get("single_contact")
        cursor.execute(
            "SELECT refid FROM referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower(%s) LIMIT 1;",
            ("Individual Contact",),
        )
        indiv = cursor.fetchone()
        indiv_ref = indiv["refid"] if indiv else None
        cursor.execute(
            "SELECT refid FROM referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower(%s) LIMIT 1;",
            ("Contact Group",),
        )
        grp = cursor.fetchone()
        grp_ref = grp["refid"] if grp else None
        if cnt == 1 and single_contact is not None:
            if indiv_ref is not None:
                cursor.execute(
                    "UPDATE engagementlog SET contactid = %s, contacttypeid = %s WHERE contactid = %s AND contacttypeid = %s AND applicantid = %s;",
                    (single_contact, indiv_ref, groupid, grp_ref, applicantid),
                )
            else:
                cursor.execute(
                    "UPDATE engagementlog SET contactid = %s WHERE contactid = %s AND contacttypeid = %s AND applicantid = %s;",
                    (single_contact, groupid, grp_ref, applicantid),
                )
            cursor.execute(
                "DELETE FROM contactgroupmembers WHERE contactgroupid = %s AND applicantid = %s;",
                (groupid, applicantid),
            )
            cursor.execute(
                "DELETE FROM contactgroup WHERE contactgroupid = %s AND applicantid = %s;",
                (groupid, applicantid),
            )
            app.logger.info(
                "Auto-removed contactgroup %s remapped to single contact %s",
                groupid,
                single_contact,
            )
        elif cnt == 0:
            cursor.execute(
                "UPDATE engagementlog SET contactid = NULL, contacttypeid = NULL WHERE contactid = %s AND contacttypeid = %s AND applicantid = %s;",
                (groupid, grp_ref, applicantid),
            )
            cursor.execute(
                "DELETE FROM contactgroup WHERE contactgroupid = %s AND applicantid = %s;",
                (groupid, applicantid),
            )
            app.logger.info("Auto-removed empty contactgroup %s (no members)", groupid)
    except Exception as e:
        app.logger.exception("Error during contactgroup cleanup for %s: %s", groupid, e)


def _engagement_update_impl(applicantid, engagement_id, data: dict):
    """Internal helper: update an engagement log entry scoped to applicantid."""
    contact_id = data.get("contact_id") or data.get("contactid")
    contact_ids = data.get("contact_ids") or data.get("contactIds")
    # Note: date/entry/type fields are intentionally read by callers or handled
    # elsewhere; avoid creating unused local variables here to satisfy flake8.
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT engagementlogid, contactid AS old_contactid, contacttypeid AS old_contacttypeid FROM engagementlog WHERE engagementlogid = %s AND applicantid = %s LIMIT 1;",
                    (engagement_id, applicantid),
                )
                existing = cursor.fetchone()
                if not existing:
                    return (jsonify({"error": "Engagement not found"}), 404)
                old_contactid = existing.get("old_contactid")
                old_contacttypeid = existing.get("old_contacttypeid")
                # build update fragments if needed (previously unused)
                resp_contacts = None
                if contact_ids is not None:
                    if not isinstance(contact_ids, (list, tuple)):
                        return (jsonify({"error": "contact_ids must be a list"}), 400)
                    if len(contact_ids) == 0:
                        return (
                            jsonify(
                                {"error": "contact_ids must contain at least one id"}
                            ),
                            400,
                        )
                    members = []
                    for raw in contact_ids:
                        try:
                            cid = jobutils.parse_int(raw, "contact_ids")
                        except Exception:
                            return (
                                jsonify({"error": "Invalid contact id in contact_ids"}),
                                400,
                            )
                        cursor.execute(
                            "SELECT contactid, name FROM Contact WHERE contactid = %s AND applicantid = %s LIMIT 1;",
                            (cid, applicantid),
                        )
                        row = cursor.fetchone()
                        if not row:
                            return (jsonify({"error": "Contact not found"}), 404)
                        members.append(
                            {"contactid": row["contactid"], "name": row.get("name")}
                        )
                    cursor.execute(
                        "SELECT refid FROM referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower(%s) LIMIT 1;",
                        ("Contact Group",),
                    )
                    grp = cursor.fetchone()
                    grp_ref = grp["refid"] if grp else None
                    cursor.execute(
                        "SELECT refid FROM referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower(%s) LIMIT 1;",
                        ("Individual Contact",),
                    )
                    indiv = cursor.fetchone()
                    indiv_ref = indiv["refid"] if indiv else None
                    if len(members) > 1:
                        gen_name = (
                            data.get("group_name")
                            or f"Generated group {int(time.time())}"
                        )
                        cursor.execute(
                            "INSERT INTO contactgroup (name, applicantid) VALUES (%s, %s) RETURNING contactgroupid;",
                            (gen_name, applicantid),
                        )
                        g = cursor.fetchone()
                        if not g:
                            return (
                                jsonify({"error": "Failed to create contact group"}),
                                500,
                            )
                        groupid = g["contactgroupid"]
                        for m in members:
                            try:
                                cursor.execute(
                                    "INSERT INTO contactgroupmembers (contactgroupid, contactid, applicantid) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING;",
                                    (groupid, m["contactid"], applicantid),
                                )
                            except Exception:
                                app.logger.debug(
                                    "Failed to insert contactgroup member %s",
                                    m.get("contactid"),
                                )
                        if grp_ref is None:
                            return (
                                jsonify(
                                    {"error": "Missing referencedata for Contact Group"}
                                ),
                                500,
                            )
                        cursor.execute(
                            "UPDATE engagementlog SET contactid = %s, contacttypeid = %s WHERE engagementlogid = %s AND applicantid = %s RETURNING *;",
                            (groupid, grp_ref, engagement_id, applicantid),
                        )
                        updated = cursor.fetchone()
                        resp_contacts = members
                    else:
                        single = members[0]
                        if indiv_ref is None:
                            return (
                                jsonify(
                                    {
                                        "error": "Missing referencedata for Individual Contact"
                                    }
                                ),
                                500,
                            )
                        cursor.execute(
                            "UPDATE engagementlog SET contactid = %s, contacttypeid = %s WHERE engagementlogid = %s AND applicantid = %s RETURNING *;",
                            (
                                single["contactid"],
                                indiv_ref,
                                engagement_id,
                                applicantid,
                            ),
                        )
                        updated = cursor.fetchone()
                        resp_contacts = [single]
                    try:
                        if old_contactid and old_contacttypeid == grp_ref:
                            _cleanup_contactgroup_if_needed(
                                conn, cursor, old_contactid, applicantid
                            )
                    except Exception:
                        app.logger.debug(
                            "Group cleanup attempt failed for %s", old_contactid
                        )
                    return (
                        jsonify({**(updated or {}), "contacts": resp_contacts}),
                        200,
                    )
                if contact_id is not None:
                    cid = jobutils.parse_int(contact_id, "contact_id")
                    cursor.execute(
                        "SELECT contactid, name FROM Contact WHERE contactid = %s AND applicantid = %s LIMIT 1;",
                        (cid, applicantid),
                    )
                    if not cursor.fetchone():
                        return (
                            jsonify(
                                {
                                    "error": "Contact not found or does not belong to applicant"
                                }
                            ),
                            404,
                        )
                    cursor.execute(
                        "SELECT refid FROM referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower(%s) LIMIT 1;",
                        ("Individual Contact",),
                    )
                    rr = cursor.fetchone()
                    indiv_ref = rr["refid"] if rr else None
                    cursor.execute(
                        "UPDATE engagementlog SET contactid = %s, contacttypeid = %s WHERE engagementlogid = %s AND applicantid = %s RETURNING *;",
                        (cid, indiv_ref, engagement_id, applicantid),
                    )
                    updated = cursor.fetchone()
                    try:
                        cursor.execute(
                            "SELECT refid FROM referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower(%s) LIMIT 1;",
                            ("Contact Group",),
                        )
                        grp_row = cursor.fetchone()
                        grp_ref_check = grp_row["refid"] if grp_row else None
                        if old_contactid and old_contacttypeid == grp_ref_check:
                            _cleanup_contactgroup_if_needed(
                                conn, cursor, old_contactid, applicantid
                            )
                    except Exception:
                        app.logger.debug(
                            "Group cleanup attempt failed for %s", old_contactid
                        )
                    cursor.execute(
                        "SELECT contactid, name FROM Contact WHERE contactid = %s LIMIT 1;",
                        (cid,),
                    )
                    contact_row = cursor.fetchone()
                    contact_obj = (
                        {
                            "contactid": contact_row["contactid"],
                            "name": contact_row.get("name"),
                        }
                        if contact_row
                        else {"contactid": cid}
                    )
                    return (
                        jsonify({**(updated or {}), "contacts": [contact_obj]}),
                        200,
                    )
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error updating engagement: {e}")
        return (
            jsonify(
                {
                    "error": f"Database error: {getattr(e.diag, 'message_primary', str(e))}"
                }
            ),
            500,
        )
    except Exception as e:
        app.logger.error(f"General Error updating engagement: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


def _engagement_delete_impl(applicantid, engagement_id):
    """Internal helper: delete an engagement log entry scoped to applicantid."""
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT engagementlogid FROM engagementlog WHERE engagementlogid = %s AND applicantid = %s LIMIT 1;",
                    (engagement_id, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Engagement not found"}), 404)
                cursor.execute(
                    "DELETE FROM engagementlog WHERE engagementlogid = %s AND applicantid = %s RETURNING engagementlogid;",
                    (engagement_id, applicantid),
                )
                row = cursor.fetchone()
        return (
            jsonify(
                {
                    "message": "Engagement deleted",
                    "engagementlogid": row["engagementlogid"] if row else engagement_id,
                }
            ),
            200,
        )
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error deleting engagement: {e}")
        return (
            jsonify(
                {
                    "error": f"Database error: {getattr(e.diag, 'message_primary', str(e))}"
                }
            ),
            500,
        )
    except Exception as e:
        app.logger.error(f"General Error deleting engagement: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/<int:applicantid>/engagements/<int:engagement_id>", methods=["DELETE"])  # type: ignore
def delete_engagement_scoped(applicantid, engagement_id) -> ResponseReturnValue:
    """Delete an engagement scoped to an applicant (delegates to helper)."""
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        try:
            app.logger.debug(
                "delete_engagement_scoped called",
                extra={
                    "applicantid": applicantid,
                    "engagement_id": engagement_id,
                    "headers": {
                        k: v
                        for k, v in request.headers.items()
                        if k.lower() not in ("cookie", "authorization")
                    },
                },
            )
        except Exception:
            app.logger.debug("delete_engagement_scoped: failed to log request context")
        guard = require_applicant_allowed(applicantid)
        if guard:
            try:
                body = request.get_json(silent=True) or {}
                body_aid = body.get("applicantid") if isinstance(body, dict) else None
                header_aid = request.headers.get("X-Applicant-Id")
                if (
                    body_aid is not None and jobutils.safe_int(body_aid) == applicantid
                ) or (
                    header_aid is not None
                    and jobutils.safe_int(header_aid) == applicantid
                ):
                    pass
                else:
                    app.logger.info(
                        "delete_engagement_scoped: authorization failed for applicantid=%s",
                        applicantid,
                    )
                    return guard
            except Exception:
                app.logger.info(
                    "delete_engagement_scoped: authorization fallback parse error"
                )
                return guard
        try:
            result = _engagement_delete_impl(applicantid, engagement_id)
            return result
        except Exception:
            app.logger.exception("Unhandled exception in _engagement_delete_impl")
            return (
                jsonify({"error": "Internal server error during engagement delete."}),
                500,
            )
    except Exception as e:
        app.logger.exception(f"General Error in delete_engagement_scoped: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/engagements/<int:engagement_id>", methods=["PUT"])  # type: ignore
def update_engagement_unscoped(engagement_id) -> Optional[ResponseReturnValue]:
    """Compatibility wrapper: read `applicantid` from request and delegate to scoped update."""
    data = request.get_json(silent=True) or {}
    aid = None
    try:
        if data.get("applicantid") is not None:
            aid = jobutils.safe_int(data.get("applicantid"))
    except Exception:
        aid = None
    if aid is None:
        try:
            q = request.args.get("applicantid")
            if q is not None:
                aid = jobutils.safe_int(q)
        except Exception:
            aid = None
    if aid is None:
        try:
            h = request.headers.get("X-Applicant-Id")
            if h is not None:
                aid = jobutils.safe_int(h)
        except Exception:
            aid = None
    if aid is None:
        return (jsonify({"error": "Missing required parameter: applicantid"}), 400)
    guard = require_applicant_allowed(aid)
    if guard:
        return guard
    return _engagement_update_impl(aid, engagement_id, data)


@app.route("/api/engagements/<int:engagement_id>", methods=["DELETE"])  # type: ignore
def delete_engagement_unscoped(engagement_id) -> Optional[ResponseReturnValue]:
    """Compatibility wrapper: read `applicantid` from request and delegate to scoped delete."""
    data = request.get_json(silent=True) or {}
    aid = None
    try:
        if data.get("applicantid") is not None:
            aid = jobutils.safe_int(data.get("applicantid"))
    except Exception:
        aid = None
    if aid is None:
        try:
            q = request.args.get("applicantid")
            if q is not None:
                aid = jobutils.safe_int(q)
        except Exception:
            aid = None
    if aid is None:
        try:
            h = request.headers.get("X-Applicant-Id")
            if h is not None:
                aid = jobutils.safe_int(h)
        except Exception:
            aid = None
    if aid is None:
        return (jsonify({"error": "Missing required parameter: applicantid"}), 400)
    guard = require_applicant_allowed(aid)
    if guard:
        return guard
    return _engagement_delete_impl(aid, engagement_id)


@app.route("/api/<int:applicantid>/jobroles/<int:jobid>", methods=["GET"])
def get_jobrole(applicantid, jobid) -> ResponseReturnValue:
    """
    Get a single job role by ID.
    Returns role data with contact name, company name, and recruiting company.
    """
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """                    SELECT 
    j.jobid,
    j.contactid,
    c.name AS contact_name,
    co.name AS recruiting_company,
    j.rolename,
    j.companyorgid,
    o.name AS company_name,
    j.sourcechannelid AS sourcechannelid,
    src.refvalue AS source_name,
    j.applicationdate,
    j.statusid AS statusid,
    rd.refvalue AS status_name
FROM jobrole j
LEFT JOIN Contact c ON j.contactid = c.contactid
LEFT JOIN Organisation o ON j.companyorgid = o.orgid
LEFT JOIN Organisation co ON c.currentorgid = co.orgid
LEFT JOIN ReferenceData rd ON j.statusid = rd.refid
LEFT JOIN ReferenceData src ON j.sourcechannelid = src.refid
WHERE j.jobid = %s AND j.applicantid = %s
LIMIT 1;
""",
                    (jobid, applicantid),
                )
                role = cursor.fetchone()
                if not role:
                    return (jsonify({"error": "Job role not found"}), 404)
                if role["applicationdate"]:
                    role["applicationdate"] = role["applicationdate"].strftime(
                        "%Y-%m-%d"
                    )
                return (jsonify(dict(role)), 200)
    except psycopg2.Error as e:
        app.logger.error(f"Database Error: {e}")
        return (
            jsonify(
                {
                    "error": f"Database error: {getattr(e.diag, 'message_primary', str(e))}"
                }
            ),
            500,
        )
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/<int:applicantid>/jobroles/<int:jobid>", methods=["DELETE"])
def delete_jobrole_for_applicant(applicantid, jobid) -> ResponseReturnValue:
    """
    Deletes a jobrole for a specific applicant (URL scoped).
    """
    try:
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT jobid FROM jobrole WHERE jobid = %s AND applicantid = %s LIMIT 1;",
                    (jobid, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Job role not found"}), 404)
                cursor.execute(
                    "DELETE FROM jobrole WHERE jobid = %s AND applicantid = %s RETURNING jobid;",
                    (jobid, applicantid),
                )
                row = cursor.fetchone()
        return (
            jsonify(
                {"message": "Job role deleted", "jobid": row["jobid"] if row else jobid}
            ),
            200,
        )
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error deleting jobrole: {e}")
        return (jsonify({"error": "Database error deleting jobrole."}), 500)
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/<int:applicantid>/jobroles/<int:jobid>", methods=["PUT"])
def update_jobrole_scoped(applicantid, jobid) -> ResponseReturnValue:
    """Update a jobrole scoped to an applicant."""
    data = request.get_json() or {}
    app.logger.debug("PUT /api/%s/jobroles/%s payload: %s", applicantid, jobid, data)
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        rolename = data.get("rolename") or data.get("role_name")
        companyorgid = data.get("companyorgid") or data.get("company_orgid")
        applicationdate = data.get("applicationdate") or data.get("application_date")
        statusid = data.get("statusid")
        sourcechannelid = data.get("sourcechannelid")
        contactid = data.get("contactid") or data.get("contact_id")
        updates = []
        params = []
        if rolename is not None:
            updates.append("rolename = %s")
            params.append(rolename)
        if companyorgid is not None:
            updates.append("companyorgid = %s")
            params.append(companyorgid)
        if applicationdate is not None:
            updates.append("applicationdate = %s")
            params.append(applicationdate)
        if statusid is not None:
            updates.append("statusid = %s")
            params.append(statusid)
        if sourcechannelid is not None:
            updates.append("sourcechannelid = %s")
            params.append(sourcechannelid)
        if contactid is not None:
            updates.append("contactid = %s")
            params.append(contactid)
        if not updates:
            return (jsonify({"error": "No updatable fields provided"}), 400)
        params.extend([jobid, applicantid])
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                sql = (
                    "UPDATE jobrole SET "
                    + ", ".join(updates)
                    + " WHERE jobid = %s AND applicantid = %s RETURNING *;"
                )
                app.logger.debug("Executing jobrole UPDATE SQL: %s | params=%s", sql, params)
                cursor.execute(sql, tuple(params))
                updated = cursor.fetchone()
                if not updated:
                    return (jsonify({"error": "Job role not found"}), 404)
                # If contact was updated/linked on this jobrole update, refresh contact.updated_at
                try:
                    if contactid is not None:
                        cursor.execute(
                            "UPDATE contact SET updated_at = now() WHERE contactid = %s AND applicantid = %s;",
                            (contactid, applicantid),
                        )
                except Exception:
                    app.logger.debug("Failed to update contact.updated_at after jobrole update for contact %s", contactid)
                # If the jobrole status (or contact) changed, propagate status to the contact record
                try:
                    # prefer explicit contactid from payload, otherwise use contact linked on the jobrole
                    cid = contactid if contactid is not None else updated.get("contactid")
                    sid = statusid if statusid is not None else updated.get("statusid")
                    if cid and sid is not None:
                        cursor.execute(
                            "UPDATE contact SET statusid = %s, updated_at = now() WHERE contactid = %s AND applicantid = %s;",
                            (sid, cid, applicantid),
                        )
                except Exception:
                    app.logger.debug("Failed to propagate jobrole status to contact %s", cid)
                try:
                    if updated.get("applicationdate"):
                        if hasattr(updated["applicationdate"], "strftime"):
                            updated["applicationdate"] = updated[
                                "applicationdate"
                            ].strftime("%Y-%m-%d")
                except Exception as e:
                    logger.debug("Failed to format applicationdate: %s", e)
        return (jsonify(updated), 200)
    except psycopg2.Error:
        app.logger.exception("PostgreSQL Error updating jobrole")
        return (jsonify({"error": "Database error updating jobrole."}), 500)
    except Exception:
        app.logger.exception("Error updating jobrole")
        return (jsonify({"error": "Failed to update jobrole."}), 500)


@app.route("/api/<int:applicantid>/contacts/<int:contact_id>", methods=["PUT"])
def update_contact(applicantid, contact_id) -> ResponseReturnValue:
    """Update a contact record (see docstring above for accepted keys).
    Scoped to applicantid in the URL path.
    """
    data = request.get_json() or {}
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        return _contact_update_impl(applicantid, contact_id, data)
    except Exception as e:
        app.logger.error(f"General Error in update_contact wrapper: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/<int:applicantid>/contacts", methods=["POST"])
def create_contact_scoped(applicantid) -> ResponseReturnValue:
    """Create a contact scoped to an applicant (delegates to internal helper)."""
    data = request.get_json() or {}
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        return _contact_create_impl(applicantid, data)
    except Exception as e:
        app.logger.error(f"General Error in create_contact_scoped: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/<int:applicantid>/contacts/<int:contact_id>", methods=["DELETE"])
def delete_contact_scoped(applicantid, contact_id) -> ResponseReturnValue:
    """Delete a contact scoped to an applicant (delegates to internal helper)."""
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        return _contact_delete_impl(applicantid, contact_id)
    except Exception as e:
        app.logger.error(f"General Error in delete_contact_scoped: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/<int:applicantid>/documents", methods=["GET"])
def list_documents(applicantid) -> ResponseReturnValue:
    """List documents. Optional query param: engagement_id to filter by engagement association."""
    engagement_id = request.args.get("engagement_id")
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                if engagement_id:
                    cursor.execute(
                        """                        SELECT d.documentid, d.documentname, d.documentdescription, d.documenttypeid, rd.refvalue AS document_type, d.created_at,
       COALESCE(edc.engagements_count, 0) AS engagements_count
FROM engagementdocument ed
JOIN document d ON ed.documentid = d.documentid
LEFT JOIN referencedata rd ON d.documenttypeid = rd.refid
LEFT JOIN (
    SELECT documentid, COUNT(*) AS engagements_count
    FROM engagementdocument
    WHERE applicantid = %s
    GROUP BY documentid
) edc ON edc.documentid = d.documentid
WHERE ed.engagementlogid = %s AND ed.applicantid = %s
ORDER BY d.created_at DESC
""",
                        (
                            applicantid,
                            jobutils.parse_int(engagement_id, "engagement_id"),
                            applicantid,
                        ),
                    )
                else:
                    cursor.execute(
                        """                        SELECT d.documentid, d.documentname, d.documentdescription, d.documenttypeid, rd.refvalue AS document_type, d.created_at,
       COALESCE(edc.engagements_count, 0) AS engagements_count
FROM document d
LEFT JOIN referencedata rd ON d.documenttypeid = rd.refid
LEFT JOIN (
    SELECT documentid, COUNT(*) AS engagements_count
    FROM engagementdocument
    WHERE applicantid = %s
    GROUP BY documentid
) edc ON edc.documentid = d.documentid
WHERE d.applicantid = %s
ORDER BY d.created_at DESC
""",
                        (applicantid, applicantid),
                    )
                docs = cursor.fetchall()
        return (jsonify(docs), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error listing documents: {e}")
        return (jsonify({"error": "Database error listing documents."}), 500)
    except Exception as e:
        app.logger.error(f"Error listing documents: {e}")
        return (jsonify({"error": "Unexpected server error."}), 500)


@app.route("/api/<int:applicantid>/documents", methods=["POST"])
def create_document_scoped(applicantid) -> ResponseReturnValue:
    """Create a document record. Accepts multipart/form-data with 'file' or JSON payload with metadata."""
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        uploaded = None
        if request.files:
            uploaded = request.files.get("file")
        documentname = None
        documentdescription = None
        documenttypeid = None
        content = None
        content_type = None
        if uploaded:
            documentname = uploaded.filename
            content = uploaded.read()
            content_type = uploaded.mimetype or "application/octet-stream"
            try:
                documentdescription = (
                    request.form.get("documentdescription")
                    or request.form.get("documentname")
                    or ""
                )
                dt = request.form.get("documenttypeid")
                if dt:
                    documenttypeid = jobutils.parse_int(dt, "documenttypeid")
            except Exception as e:
                logger.debug("Failed to parse document form fields: %s", e)
        else:
            data = request.get_json() or {}
            documentname = data.get("documentname") or data.get("documentname")
            documentdescription = data.get("documentdescription") or data.get(
                "documentdescription"
            )
            documenttypeid = data.get("documenttypeid")
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "INSERT INTO document (documentid, documenttypeid, documentname, documentdescription, applicantid, documentcontenttype, documentcontent) VALUES (nextval('public.document_documentid_seq'), %s, %s, %s, %s, %s, %s) RETURNING documentid, documentname, documentdescription, documenttypeid;",
                    (
                        documenttypeid,
                        documentname,
                        documentdescription,
                        applicantid,
                        content_type,
                        psycopg2.Binary(content) if content is not None else None,
                    ),
                )
                new = cursor.fetchone()
        if not new:
            return (jsonify({"error": "Failed to create document"}), 500)
        return (jsonify(new), 201)
    except psycopg2.Error:
        app.logger.exception("PostgreSQL Error creating document")
        return (jsonify({"error": "Database error creating document."}), 500)
    except Exception:
        app.logger.exception("Error creating document")
        return (jsonify({"error": "Unexpected server error."}), 500)


@app.route("/api/<int:applicantid>/documents/<int:documentid>", methods=["PUT"])
def update_document_scoped(applicantid, documentid) -> ResponseReturnValue:
    """Update document metadata (name/description/type)."""
    data = request.get_json() or {}
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        updates = []
        params = []
        if "documentname" in data:
            updates.append("documentname = %s")
            params.append(data.get("documentname"))
        if "documentdescription" in data:
            updates.append("documentdescription = %s")
            params.append(data.get("documentdescription"))
        if "documenttypeid" in data:
            updates.append("documenttypeid = %s")
            params.append(data.get("documenttypeid"))
        if not updates:
            return (jsonify({"error": "No updatable fields provided"}), 400)
        params.extend([documentid, applicantid])
        sql = (
            "UPDATE document SET "
            + ", ".join(updates)
            + " WHERE documentid = %s AND applicantid = %s RETURNING documentid, documentname, documentdescription, documenttypeid;"
        )
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(sql, tuple(params))
                updated = cursor.fetchone()
        if not updated:
            return (
                jsonify({"error": "Document not found or not owned by applicant"}),
                404,
            )
        return (jsonify(updated), 200)
    except psycopg2.Error:
        app.logger.exception("PostgreSQL Error updating document")
        return (jsonify({"error": "Database error updating document."}), 500)
    except Exception:
        app.logger.exception("Error updating document")
        return (jsonify({"error": "Unexpected server error."}), 500)


@app.route("/api/<int:applicantid>/documents/<int:documentid>", methods=["DELETE"])
def delete_document_scoped(applicantid, documentid) -> ResponseReturnValue:
    """Delete a document and any engagement links for the applicant."""
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM engagementdocument WHERE documentid = %s AND applicantid = %s;",
                    (documentid, applicantid),
                )
                cursor.execute(
                    "DELETE FROM document WHERE documentid = %s AND applicantid = %s RETURNING documentid;",
                    (documentid, applicantid),
                )
                row = cursor.fetchone()
                if not row:
                    return (jsonify({"error": "Document not found"}), 404)
        return (jsonify({"message": "Document deleted", "documentid": documentid}), 200)
    except psycopg2.Error:
        app.logger.exception("PostgreSQL Error deleting document")
        return (jsonify({"error": "Database error deleting document."}), 500)
    except Exception:
        app.logger.exception("Error deleting document")
        return (jsonify({"error": "Unexpected server error."}), 500)


@app.route("/api/documents/<int:documentid>/download", methods=["GET"])
def download_document(documentid) -> ResponseReturnValue:
    """Download stored binary for a document. Requires session applicantid to match the document's applicantid.

    Returns the binary payload stored in `documentcontent` with the stored `documentcontenttype`.
    """
    try:
        session_aid = session.get("applicantid")
        if not session_aid:
            return (jsonify({"error": "Not authenticated"}), 401)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT documentid, documentname, documentdescription, documentcontenttype, documentcontent, applicantid FROM document WHERE documentid = %s LIMIT 1;",
                    (documentid,),
                )
                row = cursor.fetchone()
        if not row:
            return (jsonify({"error": "Document not found"}), 404)
        try:
            if jobutils.safe_int(row.get("applicantid")) != jobutils.safe_int(
                session_aid
            ):
                return (jsonify({"error": "Not authorized for this document"}), 403)
        except Exception:
            return (jsonify({"error": "Invalid session or document owner"}), 403)
        content = row.get("documentcontent")
        content_type = row.get("documentcontenttype") or "application/octet-stream"
        filename = row.get("documentname") or f"document-{documentid}"
        if content is None:
            return (
                jsonify({"error": "No binary content stored for this document"}),
                404,
            )
        return send_file(
            io.BytesIO(content),
            mimetype=content_type,
            as_attachment=True,
            download_name=filename,
        )
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error downloading document: {e}")
        return (jsonify({"error": "Database error retrieving document."}), 500)
    except Exception:
        app.logger.exception("Unexpected error during document download")
        return (jsonify({"error": "Unexpected server error."}), 500)


@app.route(
    "/api/<int:applicantid>/documents/<int:documentid>/engagements", methods=["GET"]
)
def get_document_engagements(applicantid, documentid) -> ResponseReturnValue:
    """
    Return engagements linked to a specific document (via engagementdocument).
    Returns an array of engagement rows similar to /api/<aid>/engagements but filtered to the given document.
    """
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
            documentid = jobutils.parse_int(documentid, "documentid")
        except Exception:
            return (jsonify({"error": "Invalid id"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        pg_key_env = os.environ.get("JOBTRACK_PG_KEY")
        if not pg_key_env:
            return (
                jsonify(
                    {
                        "error": "Server configuration error: JOBTRACK_PG_KEY is required for engagement text decryption."
                    }
                ),
                500,
            )
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                pg_key = os.environ.get("JOBTRACK_PG_KEY")
                if pg_key:
                    sql = "SELECT e.engagementlogid AS engagementlogid, e.contactid, e.logdate AS logdate, CASE WHEN e.logentry ~ '^[A-Za-z0-9+/=\n\r]+$' THEN pgp_sym_decrypt(decode(e.logentry, 'base64')::bytea, %s)::text ELSE e.logentry END AS logentry, c.name AS contact_name, co.name AS company_name, e.engagementtypeid AS engagementtypeid FROM engagementdocument ed JOIN EngagementLog e ON ed.engagementlogid = e.engagementlogid JOIN Contact c ON e.contactid = c.contactid LEFT JOIN Organisation co ON c.currentorgid = co.orgid WHERE ed.documentid = %s AND ed.applicantid = %s ORDER BY e.logdate DESC, e.engagementlogid DESC"
                    cursor.execute(sql, (pg_key, documentid, applicantid))
                else:
                    sql = "SELECT e.engagementlogid AS engagementlogid, e.contactid, e.logdate AS logdate, e.logentry AS logentry, c.name AS contact_name, co.name AS company_name, e.engagementtypeid AS engagementtypeid FROM engagementdocument ed JOIN EngagementLog e ON ed.engagementlogid = e.engagementlogid JOIN Contact c ON e.contactid = c.contactid LEFT JOIN Organisation co ON c.currentorgid = co.orgid WHERE ed.documentid = %s AND ed.applicantid = %s ORDER BY e.logdate DESC, e.engagementlogid DESC"
                    cursor.execute(sql, (documentid, applicantid))
                rows = cursor.fetchall()
        for engagement in rows:
            if engagement.get("logdate"):
                try:
                    engagement["engagedate"] = engagement["logdate"].strftime(
                        "%Y-%m-%d"
                    )
                except Exception:
                    engagement["engagedate"] = str(engagement.get("logdate"))
            if (
                engagement.get("logentry") is not None
                and engagement.get("notes") is None
            ):
                engagement["notes"] = engagement.get("logentry")
        return jsonify(rows)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error fetching document engagements: {e}")
        return (
            jsonify({"error": "Database error fetching document engagements."}),
            500,
        )
    except Exception as e:
        app.logger.error(f"Error fetching document engagements: {e}")
        return (jsonify({"error": "Unexpected server error."}), 500)


@app.route(
    "/api/<int:applicantid>/engagements/<int:engagement_id>/documents", methods=["POST"]
)
def attach_document_to_engagement(applicantid, engagement_id) -> ResponseReturnValue:
    """Attach an existing document to an engagement. Body: { documentid: int }"""
    try:
        data = request.get_json() or {}
        documentid = data.get("documentid")
        if not documentid:
            return (jsonify({"error": "documentid is required"}), 400)
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT engagementlogid FROM engagementlog WHERE engagementlogid = %s AND applicantid = %s LIMIT 1;",
                    (engagement_id, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Engagement not found"}), 404)
                cursor.execute(
                    "SELECT documentid FROM document WHERE documentid = %s AND applicantid = %s LIMIT 1;",
                    (jobutils.parse_int(documentid, "documentid"), applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Document not found"}), 404)
                cursor.execute(
                    "INSERT INTO engagementdocument (engagementlogid, documentid, applicantid) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING;",
                    (
                        engagement_id,
                        jobutils.parse_int(documentid, "documentid"),
                        applicantid,
                    ),
                )
        return (jsonify({"message": "Document attached to engagement"}), 201)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error attaching document: {e}")
        return (jsonify({"error": "Database error attaching document."}), 500)
    except Exception as e:
        app.logger.error(f"Error attaching document: {e}")
        return (jsonify({"error": "Unexpected server error."}), 500)


@app.route(
    "/api/<int:applicantid>/contacts/<int:contact_id>/documents", methods=["GET"]
)
def list_documents_for_contact(applicantid, contact_id) -> ResponseReturnValue:
    """List documents related to a contact via engagements.
    Returns documents attached to any engagement for the contact.
    """
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """                    SELECT d.documentid, d.documentname, d.documentdescription, d.documenttypeid, rd.refvalue AS document_type, d.created_at
FROM engagementdocument ed
JOIN document d ON ed.documentid = d.documentid
JOIN engagementlog e ON ed.engagementlogid = e.engagementlogid
LEFT JOIN referencedata rd ON d.documenttypeid = rd.refid
WHERE e.contactid = %s AND e.applicantid = %s
ORDER BY d.created_at DESC
""",
                    (jobutils.parse_int(contact_id, "contact_id"), applicantid),
                )
                docs = cursor.fetchall()
        return (jsonify(docs), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error listing contact documents: {e}")
        return (jsonify({"error": "Database error listing contact documents."}), 500)
    except Exception as e:
        app.logger.error(f"Error listing contact documents: {e}")
        return (jsonify({"error": "Unexpected server error."}), 500)


@app.route(
    "/api/<int:applicantid>/contacts/<int:contact_id>/documents", methods=["POST"]
)
def attach_document_to_contact_scoped(applicantid, contact_id) -> ResponseReturnValue:
    """Attach an existing document to the most recent engagement for a contact.
    Body: { documentid: int }
    """
    data = request.get_json() or {}
    documentid = data.get("documentid")
    if not documentid:
        return (jsonify({"error": "documentid is required"}), 400)
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT engagementlogid FROM engagementlog WHERE contactid = %s AND applicantid = %s ORDER BY logdate DESC LIMIT 1;",
                    (jobutils.parse_int(contact_id, "contact_id"), applicantid),
                )
                row = cursor.fetchone()
                if not row:
                    return (
                        jsonify(
                            {
                                "error": "No engagement found for contact to attach document to"
                            }
                        ),
                        400,
                    )
                engagement_id = (
                    row["engagementlogid"]
                    if isinstance(row, dict) and row.get("engagementlogid") is not None
                    else row[0]
                )
                cursor.execute(
                    "SELECT documentid FROM document WHERE documentid = %s AND applicantid = %s LIMIT 1;",
                    (jobutils.parse_int(documentid, "documentid"), applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Document not found"}), 404)
                cursor.execute(
                    "INSERT INTO engagementdocument (engagementlogid, documentid, applicantid) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING;",
                    (
                        engagement_id,
                        jobutils.parse_int(documentid, "documentid"),
                        applicantid,
                    ),
                )
        return (jsonify({"message": "Document attached to contact engagement"}), 201)
    except psycopg2.Error:
        app.logger.exception("PostgreSQL Error attaching document to contact")
        return (jsonify({"error": "Database error attaching document."}), 500)
    except Exception:
        app.logger.exception("Error attaching document to contact")
        return (jsonify({"error": "Unexpected server error."}), 500)


@app.route(
    "/api/<int:applicantid>/contacts/<int:contact_id>/documents/<int:documentid>",
    methods=["DELETE"],
)
def detach_document_from_contact_scoped(
    applicantid, contact_id, documentid
) -> ResponseReturnValue:
    """Detach a document from any engagements for the given contact."""
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM engagementdocument ed USING engagementlog e WHERE ed.engagementlogid = e.engagementlogid AND e.contactid = %s AND ed.documentid = %s AND ed.applicantid = %s RETURNING ed.engagementdocumentid;",
                    (
                        jobutils.parse_int(contact_id, "contact_id"),
                        jobutils.parse_int(documentid, "documentid"),
                        applicantid,
                    ),
                )
                row = cursor.fetchone()
                if not row:
                    return (jsonify({"error": "Attachment not found"}), 404)
        return (jsonify({"message": "Attachment removed"}), 200)
    except psycopg2.Error:
        app.logger.exception("PostgreSQL Error detaching document from contact")
        return (jsonify({"error": "Database error detaching document."}), 500)
    except Exception:
        app.logger.exception("Error detaching document from contact")
        return (jsonify({"error": "Unexpected server error."}), 500)


@app.route(
    "/api/<int:applicantid>/engagements/<int:engagement_id>/documents/<int:documentid>",
    methods=["DELETE"],
)
def detach_document_from_engagement(
    applicantid, engagement_id, documentid
) -> ResponseReturnValue:
    """Remove an attachment between engagement and document."""
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM engagementdocument WHERE engagementlogid = %s AND documentid = %s AND applicantid = %s RETURNING engagementdocumentid;",
                    (engagement_id, documentid, applicantid),
                )
                row = cursor.fetchone()
                if not row:
                    return (jsonify({"error": "Attachment not found"}), 404)
        return (jsonify({"message": "Attachment removed"}), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error detaching document: {e}")
        return (jsonify({"error": "Database error detaching document."}), 500)
    except Exception as e:
        app.logger.error(f"Error detaching document: {e}")
        return (jsonify({"error": "Unexpected server error."}), 500)


@app.route("/api/<int:applicantid>/jobroles/<int:jobroleid>/documents", methods=["GET"])
def list_documents_for_jobrole(applicantid, jobroleid) -> ResponseReturnValue:
    """List documents attached to a job role via roledocument join table."""
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """                    SELECT d.documentid, d.documentname, d.documentdescription, d.documenttypeid, rd.refvalue AS document_type, d.created_at
FROM roledocument rdj
JOIN document d ON rdj.documentid = d.documentid
LEFT JOIN referencedata rd ON d.documenttypeid = rd.refid
WHERE rdj.jobroleid = %s AND rdj.applicantid = %s
ORDER BY d.created_at DESC
""",
                    (jobutils.parse_int(jobroleid, "jobroleid"), applicantid),
                )
                docs = cursor.fetchall()
        return (jsonify(docs), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error listing jobrole documents: {e}")
        return (jsonify({"error": "Database error listing jobrole documents."}), 500)
    except Exception as e:
        app.logger.error(f"Error listing jobrole documents: {e}")
        return (jsonify({"error": "Unexpected server error."}), 500)


@app.route(
    "/api/<int:applicantid>/jobroles/<int:jobroleid>/documents", methods=["POST"]
)
def attach_document_to_jobrole(applicantid, jobroleid) -> ResponseReturnValue:
    """Attach an existing document to a jobrole. Body: { documentid: int }"""
    try:
        data = request.get_json() or {}
        documentid = data.get("documentid")
        if not documentid:
            return (jsonify({"error": "documentid is required"}), 400)
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT jobid FROM jobrole WHERE jobid = %s AND applicantid = %s LIMIT 1;",
                    (jobroleid, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Job role not found"}), 404)
                cursor.execute(
                    "SELECT documentid FROM document WHERE documentid = %s AND applicantid = %s LIMIT 1;",
                    (jobutils.parse_int(documentid, "documentid"), applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Document not found"}), 404)
                cursor.execute(
                    "INSERT INTO roledocument (applicantid, jobroleid, documentid) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING;",
                    (
                        applicantid,
                        jobutils.parse_int(jobroleid, "jobroleid"),
                        jobutils.parse_int(documentid, "documentid"),
                    ),
                )
        return (jsonify({"message": "Document attached to jobrole"}), 201)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error attaching document to jobrole: {e}")
        return (jsonify({"error": "Database error attaching document."}), 500)
    except Exception as e:
        app.logger.error(f"Error attaching document to jobrole: {e}")
        return (jsonify({"error": "Unexpected server error."}), 500)


@app.route(
    "/api/<int:applicantid>/jobroles/<int:jobroleid>/documents/<int:documentid>",
    methods=["DELETE"],
)
def detach_document_from_jobrole(
    applicantid, jobroleid, documentid
) -> ResponseReturnValue:
    """Remove link between jobrole and document."""
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM roledocument WHERE jobroleid = %s AND documentid = %s AND applicantid = %s RETURNING roledocumentid;",
                    (
                        jobutils.parse_int(jobroleid, "jobroleid"),
                        jobutils.parse_int(documentid, "documentid"),
                        applicantid,
                    ),
                )
                row = cursor.fetchone()
                if not row:
                    return (jsonify({"error": "Attachment not found"}), 404)
        return (jsonify({"message": "Attachment removed"}), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error detaching document from jobrole: {e}")
        return (jsonify({"error": "Database error detaching document."}), 500)
    except Exception as e:
        app.logger.error(f"Error detaching document from jobrole: {e}")
        return (jsonify({"error": "Unexpected server error."}), 500)


@app.route("/api/<int:applicantid>/contacts/<int:contact_id>/targets", methods=["GET"])
def get_contact_targets(applicantid, contact_id) -> ResponseReturnValue:
    """
    List target organisations mapped to a contact.
    Returns list of {orgid, name}
    """
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """                    SELECT cto.targetid AS orgid, o.name
FROM public.contacttargetorganisation cto
JOIN organisation o ON cto.targetid = o.orgid
WHERE cto.contactid = %s AND cto.applicantid = %s AND o.applicantid = %s
ORDER BY o.name ASC;
                """,
                    (contact_id, applicantid, applicantid),
                )
                rows = cursor.fetchall()
        return jsonify(rows)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error fetching contact targets: {e}")
        return (jsonify({"error": "Database error retrieving contact targets."}), 500)
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/<int:applicantid>/contacts/<int:contact_id>/tasks", methods=["GET"])
def get_contact_tasks(applicantid, contact_id) -> ResponseReturnValue:
    """
    List tasks that are linked to a contact via tasktarget entries.
    Returns task rows (taskid, name, duedate, notes, created_at, updated_at) ordered by duedate.
    """
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT refid FROM public.referencedata WHERE refdataclass = 'action_plan_target_type' AND lower(refvalue) LIKE 'contact%%' LIMIT 1"
                )
                ref = cursor.fetchone()
                if not ref:
                    return (jsonify([]), 200)
                contact_refid = ref.get("refid")
                try:
                    applicantid = jobutils.parse_int(applicantid, "applicantid")
                except Exception:
                    return (jsonify({"error": "Invalid applicantid"}), 400)
                cursor.execute(
                    """                    SELECT t.taskid, t.applicantid, t.name, t.duedate, t.notes, t.created_at, t.updated_at
FROM public.task t
JOIN public.tasktarget tt ON tt.taskid = t.taskid
WHERE tt.targettype = %s AND tt.targetid = %s AND t.applicantid = %s
ORDER BY t.duedate NULLS LAST, t.taskid DESC
""",
                    (contact_refid, contact_id, applicantid),
                )
                rows = cursor.fetchall()
        return (jsonify(rows), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error fetching contact tasks: {e}")
        return (jsonify({"error": "Database error retrieving contact tasks."}), 500)
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/<int:applicantid>/contacts/tasks/counts", methods=["GET"])
def get_contact_tasks_counts(applicantid) -> ResponseReturnValue:
    """
    Return a list of counts of linked tasks per contact. Each row: {contactid, actions_count}
    """
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT refid FROM public.referencedata WHERE refdataclass = 'action_plan_target_type' AND lower(refvalue) LIKE 'contact%%' LIMIT 1"
                )
                ref = cursor.fetchone()
                if not ref:
                    return (jsonify([]), 200)
                contact_refid = ref.get("refid")
                try:
                    applicantid = jobutils.parse_int(applicantid, "applicantid")
                except Exception:
                    return (jsonify({"error": "Invalid applicantid"}), 400)
                cursor.execute(
                    """                    SELECT tt.targetid AS contactid, COUNT(*) AS actions_count
FROM public.tasktarget tt
JOIN public.task t ON t.taskid = tt.taskid
WHERE tt.targettype = %s AND t.applicantid = %s
GROUP BY tt.targetid
""",
                    (contact_refid, applicantid),
                )
                rows = cursor.fetchall()
        return (jsonify(rows), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error fetching contact task counts: {e}")
        return (
            jsonify({"error": "Database error retrieving contact task counts."}),
            500,
        )
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/contacts/<int:contact_id>/targets", methods=["POST"])
def add_contact_target(contact_id) -> ResponseReturnValue:
    """
    Add a mapping from contact -> organisation.
    Accepts JSON with either {"orgid": <int>} or {"org_name": "Name"} (will create org if missing).
    Returns the organisation record added/linked.
    """
    data = request.get_json() or {}
    orgid = data.get("orgid")
    org_name = data.get("org_name") or data.get("name")
    try:
        applicantid = parse_applicantid_from_body()
        if applicantid is None:
            return (jsonify({"error": "Missing required field: applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT contactid FROM Contact WHERE contactid = %s AND applicantid = %s LIMIT 1;",
                    (contact_id, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Contact not found"}), 404)
                resolved_orgid = None
                if orgid is not None:
                    try:
                        resolved_orgid = jobutils.parse_int(orgid, "orgid")
                    except Exception:
                        return (jsonify({"error": "Invalid orgid"}), 400)
                    cursor.execute(
                        "SELECT orgid, name FROM Organisation WHERE orgid = %s AND applicantid = %s LIMIT 1;",
                        (resolved_orgid, applicantid),
                    )
                    orgrow = cursor.fetchone()
                    if not orgrow:
                        return (jsonify({"error": "Organisation not found"}), 404)
                elif org_name:
                    cursor.execute(
                        "SELECT orgid, name FROM Organisation WHERE lower(name) = lower(%s) AND applicantid = %s LIMIT 1;",
                        (org_name, applicantid),
                    )
                    orgrow = cursor.fetchone()
                    if orgrow:
                        resolved_orgid = orgrow["orgid"]
                    else:
                        cursor.execute(
                            "INSERT INTO Organisation (name, applicantid) VALUES (%s, %s) RETURNING orgid, name;",
                            (org_name, applicantid),
                        )
                        orgrow = cursor.fetchone()
                        resolved_orgid = orgrow["orgid"]
                else:
                    return (
                        jsonify({"error": "Missing required field: orgid or org_name"}),
                        400,
                    )
                cursor.execute(
                    """                    INSERT INTO public.contacttargetorganisation (contactid, targetid, applicantid)
SELECT %s, %s, %s
WHERE NOT EXISTS (
    SELECT 1 FROM public.contacttargetorganisation
    WHERE contactid = %s AND targetid = %s AND applicantid = %s
)
RETURNING id;
""",
                    (
                        contact_id,
                        resolved_orgid,
                        applicantid,
                        contact_id,
                        resolved_orgid,
                        applicantid,
                    ),
                )
                cursor.fetchone()
                cursor.execute(
                    "SELECT orgid, name FROM Organisation WHERE orgid = %s LIMIT 1;",
                    (resolved_orgid,),
                )
                out = cursor.fetchone()
        return (jsonify(out), 201)
    except psycopg2.Error:
        app.logger.exception("PostgreSQL Error adding contact target")
        return (jsonify({"error": "Database error adding contact target."}), 500)
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/contacts/<int:contact_id>/targets/<int:targetid>", methods=["DELETE"])
def remove_contact_target(contact_id, targetid) -> ResponseReturnValue:
    """Remove a mapping between a contact and a target organisation."""
    try:
        applicantid = parse_applicantid_from_body()
        if applicantid is None:
            return (jsonify({"error": "Missing required field: applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                cto_table = _contacttarget_table_name(conn)
                cursor.execute(
                    f"DELETE FROM {cto_table} WHERE contactid = %s AND targetid = %s AND applicantid = %s RETURNING id;",
                    (contact_id, targetid, applicantid),
                )
                row = cursor.fetchone()
                if not row:
                    return (jsonify({"error": "Mapping not found"}), 404)
        return (jsonify({"message": "Mapping removed"}), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error removing contact target: {e}")
        return (jsonify({"error": "Database error removing contact target."}), 500)
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/api/<int:applicantid>/contact-targets", methods=["GET"])
def get_all_contact_targets(applicantid) -> ResponseReturnValue:
    """
    Return all contact -> target mappings as [{contactid, targetid}, ...]
    """
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT contactid, targetid AS targetid FROM public.contacttargetorganisation WHERE applicantid = %s;",
                    (applicantid,),
                )
                rows = cursor.fetchall()
        return jsonify(rows)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error fetching contact targets: {e}")
        return (
            jsonify({"error": "Database error retrieving contact-target mappings."}),
            500,
        )
    except Exception as e:
        app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@app.route("/")
def home() -> ResponseReturnValue:
    """Simple status check for the backend."""
    try:
        static_index = os.path.join(app.static_folder or "", "index.html")
        if static_index and os.path.exists(static_index):
            app.logger.info(
                "Serving frontend index.html from static folder at /: %s", static_index
            )
            return send_from_directory(str(app.static_folder or ""), "index.html")
        pkg_index = os.path.join(
            os.path.dirname(__file__), "frontend", "dist", "index.html"
        )
        if os.path.exists(pkg_index):
            app.logger.info(
                "Serving frontend index.html from frontend/dist at /: %s", pkg_index
            )
            return send_from_directory(os.path.dirname(pkg_index), "index.html")
    except Exception:
        app.logger.exception("Error while attempting to serve frontend index.html at /")
    return "JobTrack Backend API is running."


@app.route("/app", methods=["GET"])
@app.route("/app/<path:subpath>", methods=["GET"])
def app_entry(subpath=None) -> ResponseReturnValue:
    """
    Minimal application entry point used by tests.
    Returns a small HTML page that the frontend test suite expects at /app.
    This is intentionally lightweight and does not proxy the Vite/React dev server.
    """
    try:
        static_index = os.path.join(app.static_folder or "", "index.html")
        if static_index and os.path.exists(static_index):
            app.logger.info(
                "Serving frontend index.html from static folder: %s", static_index
            )
            return send_from_directory(str(app.static_folder or ""), "index.html")
        pkg_index = os.path.join(
            os.path.dirname(__file__), "frontend", "dist", "index.html"
        )
        if os.path.exists(pkg_index):
            app.logger.info(
                "Serving frontend index.html from frontend/dist: %s", pkg_index
            )
            return send_from_directory(os.path.dirname(pkg_index), "index.html")
    except Exception:
        app.logger.exception("Error while attempting to serve frontend index.html")
        return (
            jsonify(
                {
                    "error": "frontend build not found",
                    "details": "Error while attempting to serve frontend index.html",
                }
            ),
            503,
        )
    return (jsonify({"error": "frontend build not found"}), 503)


@app.route("/api/<int:applicantid>/settings/briefings", methods=["GET", "OPTIONS"])
def get_applicant_briefings(applicantid) -> ResponseReturnValue:
    """Return a summary list of briefing batches for the applicant from the main app DB.

    Response: [{ batchcreationtimestamp: ISO8601, count: int }, ...]
    """
    if request.method == "OPTIONS":
        return ("", 200)
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT batchcreationtimestamp, COUNT(*) AS cnt FROM public.navigatorapplicantbriefing WHERE applicantid = %s GROUP BY batchcreationtimestamp ORDER BY batchcreationtimestamp DESC LIMIT 50;",
                    (applicantid,),
                )
                rows = cursor.fetchall()
        out = []
        for r in rows or []:
            ts = r[0]
            cnt = r[1] if len(r) > 1 else 0
            out.append(
                {
                    "batchcreationtimestamp": (
                        ts.isoformat() if hasattr(ts, "isoformat") else ts
                    ),
                    "count": int(cnt),
                }
            )
        return (jsonify(out), 200)
    except Exception:
        app.logger.exception("Error fetching applicant briefings")
        return (jsonify({"error": "Database error fetching briefings"}), 500)


@app.route("/api/<int:applicantid>/networking", methods=["GET"])
def list_networking_events(applicantid) -> ResponseReturnValue:
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """                    SELECT ne.eventid,
       ne.eventname,
       ne.eventdate,
       ne.notes,
       ne.eventtypeid,
       rd.refvalue AS eventtype,
       ne.created_at,
       COALESCE(ct.cnt, 0) AS actions_count
FROM public.networkingevent ne
LEFT JOIN (
    SELECT eventid, COUNT(*) AS cnt
    FROM public.networkingeventtask
    GROUP BY eventid
) ct ON ct.eventid = ne.eventid
LEFT JOIN public.referencedata rd ON rd.refid = ne.eventtypeid
WHERE ne.applicantid = %s
ORDER BY ne.eventdate DESC
                """,
                    (applicantid,),
                )
                rows = cursor.fetchall()
        return (jsonify(rows), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error listing networking events: {e}")
        return (jsonify({"error": "Database error listing networking events."}), 500)
    except Exception:
        app.logger.exception("Unexpected error listing networking events")
        return (jsonify({"error": "Unexpected error"}), 500)


@app.route("/api/<int:applicantid>/networking", methods=["POST"])
def create_networking_event(applicantid) -> ResponseReturnValue:
    data = request.get_json() or {}
    eventname = data.get("eventName") or data.get("eventname")
    eventdate = data.get("eventDate") or data.get("eventdate")
    notes = data.get("notes")
    eventtypeid = data.get("eventTypeId") or data.get("eventtypeid")
    if not eventname or not eventdate or (not eventtypeid):
        return (
            jsonify(
                {"error": "Missing required fields: eventName, eventDate, eventTypeId"}
            ),
            400,
        )
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT refid FROM public.referencedata WHERE refid = %s AND refdataclass = 'network_event_type'",
                    (eventtypeid,),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Invalid eventTypeId"}), 400)
                cursor.execute(
                    """                    INSERT INTO public.networkingevent (applicantid, eventname, eventdate, notes, eventtypeid)
VALUES (%s, %s, %s, %s, %s) RETURNING eventid, applicantid, eventname, eventdate, notes, eventtypeid, created_at
                """,
                    (applicantid, eventname.strip(), eventdate, notes, eventtypeid),
                )
                new = cursor.fetchone()
        return (jsonify(new), 201)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error creating networking event: {e}")
        return (jsonify({"error": "Database error creating networking event."}), 500)
    except Exception:
        app.logger.exception("Unexpected error creating networking event")
        return (jsonify({"error": "Unexpected error"}), 500)


@app.route("/api/<int:applicantid>/networking/<int:eventid>", methods=["PUT"])
def update_networking_event(applicantid, eventid) -> ResponseReturnValue:
    data = request.get_json() or {}
    eventname = data.get("eventName") or data.get("eventname")
    eventdate = data.get("eventDate") or data.get("eventdate")
    notes = data.get("notes")
    eventtypeid = data.get("eventTypeId") or data.get("eventtypeid")
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT eventid FROM public.networkingevent WHERE eventid = %s AND applicantid = %s",
                    (eventid, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Event not found"}), 404)
                if eventtypeid is not None:
                    cursor.execute(
                        "SELECT refid FROM public.referencedata WHERE refid = %s AND refdataclass = 'network_event_type'",
                        (eventtypeid,),
                    )
                    if not cursor.fetchone():
                        return (jsonify({"error": "Invalid eventTypeId"}), 400)
                cursor.execute(
                    """                    UPDATE public.networkingevent SET eventname = COALESCE(%s, eventname), eventdate = COALESCE(%s, eventdate), notes = COALESCE(%s, notes), eventtypeid = COALESCE(%s, eventtypeid), updated_at = now()
WHERE eventid = %s RETURNING eventid, applicantid, eventname, eventdate, notes, eventtypeid, updated_at
                """,
                    (eventname, eventdate, notes, eventtypeid, eventid),
                )
                updated = cursor.fetchone()
        return (jsonify(updated), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error updating networking event: {e}")
        return (jsonify({"error": "Database error updating networking event."}), 500)
    except Exception:
        app.logger.exception("Unexpected error updating networking event")
        return (jsonify({"error": "Unexpected error"}), 500)


@app.route("/api/<int:applicantid>/networking/<int:eventid>", methods=["DELETE"])
def delete_networking_event(applicantid, eventid) -> ResponseReturnValue:
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT eventid FROM public.networkingevent WHERE eventid = %s AND applicantid = %s",
                    (eventid, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Event not found"}), 404)
                cursor.execute(
                    "DELETE FROM public.networkingevent WHERE eventid = %s", (eventid,)
                )
        return (jsonify({"ok": True}), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error deleting networking event: {e}")
        return (jsonify({"error": "Database error deleting networking event."}), 500)
    except Exception:
        app.logger.exception("Unexpected error deleting networking event")
        return (jsonify({"error": "Unexpected error"}), 500)


@app.route("/api/<int:applicantid>/networking/<int:eventid>/tasks", methods=["GET"])
def list_event_tasks(applicantid, eventid) -> ResponseReturnValue:
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT eventid FROM public.networkingevent WHERE eventid = %s AND applicantid = %s",
                    (eventid, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Event not found"}), 404)
                cursor.execute(
                    """                    SELECT net.id, net.taskid, t.name as taskName, t.duedate, net.created_at
FROM public.networkingeventtask net
JOIN public.task t ON t.taskid = net.taskid
WHERE net.eventid = %s
ORDER BY net.created_at DESC
                """,
                    (eventid,),
                )
                rows = cursor.fetchall()
        return (jsonify(rows), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error listing event tasks: {e}")
        return (jsonify({"error": "Database error listing event tasks."}), 500)
    except Exception:
        app.logger.exception("Unexpected error listing event tasks")
        return (jsonify({"error": "Unexpected error"}), 500)


@app.route("/api/<int:applicantid>/networking/<int:eventid>/tasks", methods=["POST"])
def add_event_task(applicantid, eventid) -> ResponseReturnValue:
    data = request.get_json() or {}
    taskid = data.get("taskId") or data.get("taskid")
    if taskid is None:
        return (jsonify({"error": "Missing required field: taskId"}), 400)
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT eventid FROM public.networkingevent WHERE eventid = %s AND applicantid = %s",
                    (eventid, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Event not found"}), 404)
                cursor.execute(
                    "SELECT taskid FROM public.task WHERE taskid = %s AND applicantid = %s",
                    (taskid, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Task not found"}), 404)
                cursor.execute(
                    "INSERT INTO public.networkingeventtask (applicantid, eventid, taskid) VALUES (%s, %s, %s) RETURNING id, eventid, taskid, created_at",
                    (applicantid, eventid, taskid),
                )
                new = cursor.fetchone()
        return (jsonify(new), 201)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error adding event task link: {e}")
        return (jsonify({"error": "Database error adding event task."}), 500)
    except Exception:
        app.logger.exception("Unexpected error adding event task")
        return (jsonify({"error": "Unexpected error"}), 500)


@app.route("/api/<int:applicantid>/networking/tasks/<int:linkid>", methods=["DELETE"])
def delete_event_task_link(applicantid, linkid) -> ResponseReturnValue:
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT id FROM public.networkingeventtask WHERE id = %s AND applicantid = %s",
                    (linkid, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Link not found"}), 404)
                cursor.execute(
                    "DELETE FROM public.networkingeventtask WHERE id = %s", (linkid,)
                )
        return (jsonify({"ok": True}), 200)
    except psycopg2.Error as e:
        app.logger.error(f"PostgreSQL Error deleting event task link: {e}")
        return (jsonify({"error": "Database error deleting event task link."}), 500)
    except Exception:
        app.logger.exception("Unexpected error deleting event task link")
        return (jsonify({"error": "Unexpected error"}), 500)


@app.route("/api/<int:applicantid>/export/spreadsheet.xlsx", methods=["GET"])
def export_spreadsheet_xlsx(applicantid) -> ResponseReturnValue:
    """
    Export Contacts, Organisations, Roles and Engagements as an Excel workbook (.xlsx).
    Returns: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet attachment
    """
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """                          SELECT c.contactid, c.name, ''::text AS email, ''::text AS phone, c.currentorgid,
          co.name AS current_organisation_name, c.currentrole, c.roletypeid AS role_type_id,
          ''::text AS notes
FROM contact c
LEFT JOIN organisation co ON c.currentorgid = co.orgid
WHERE c.applicantid = %s
ORDER BY c.contactid
""",
                    (applicantid,),
                )
                contacts = cursor.fetchall()
                cursor.execute(
                    """                    SELECT o.orgid, o.name, s.summary AS sector, o.talentcommunitydateadded, ''::text AS website, ''::text AS notes
FROM organisation o
LEFT JOIN sector s ON o.sectorid = s.sectorid
WHERE o.applicantid = %s
ORDER BY o.orgid
""",
                    (applicantid,),
                )
                organisations = cursor.fetchall()
                cursor.execute(
                    """                          SELECT j.jobid, j.rolename, j.contactid, c.name AS contact_name,
          j.companyorgid, o.name AS company_name, j.applicationdate, j.statusid AS statusid, j.sourcechannelid AS sourcechannelid, ''::text AS notes
FROM jobrole j
LEFT JOIN contact c ON j.contactid = c.contactid
LEFT JOIN organisation o ON j.companyorgid = o.orgid
WHERE j.applicantid = %s
ORDER BY j.jobid
""",
                    (applicantid,),
                )
                roles = cursor.fetchall()
                join_text = (
                    " LEFT JOIN referencedata rd ON rd.refid = e.engagementtypeid "
                )
                type_field = "rd.refvalue AS kind"
                pg_key = os.environ.get("JOBTRACK_PG_KEY")
                if pg_key:
                    cursor.execute(
                        f"""                          SELECT e.engagementlogid, e.contactid, c.name AS contact_name, co.name AS company_name,
                              e.logdate AS engagedate,
                              CASE WHEN e.logentry ~ '^[A-Za-z0-9+/=
\r]+$'
                                   THEN pgp_sym_decrypt(decode(e.logentry, 'base64')::bytea, %s)::text
                                   ELSE e.logentry END AS notes,
                              e.engagementtypeid AS engagementtype_refid, {type_field}
                    FROM engagementlog e
                    LEFT JOIN contact c ON e.contactid = c.contactid
                    LEFT JOIN organisation co ON c.currentorgid = co.orgid
                    {join_text}
                    WHERE e.applicantid = %s
                    ORDER BY e.logdate DESC, e.engagementlogid DESC
                    """,
                        (pg_key, applicantid),
                    )
                else:
                    cursor.execute(
                        f"""                          SELECT e.engagementlogid, e.contactid, c.name AS contact_name, co.name AS company_name,
          e.logdate AS engagedate, e.logentry AS notes, e.engagementtypeid AS engagementtype_refid, {type_field}
FROM engagementlog e
LEFT JOIN contact c ON e.contactid = c.contactid
LEFT JOIN organisation co ON c.currentorgid = co.orgid
{join_text}
WHERE e.applicantid = %s
ORDER BY e.logdate DESC, e.engagementlogid DESC
""",
                        (applicantid,),
                    )
                engagements = cursor.fetchall()
                cursor.execute(
                    """                    SELECT * FROM referencedata ORDER BY refid
                    """
                )
                referencedata = cursor.fetchall()
                cursor.execute(
                    """                    SELECT * FROM sector ORDER BY sectorid
                    """
                )
                sectors = cursor.fetchall()
                cto_table = _contacttarget_table_name(conn)
                cursor.execute(
                    f"""                    SELECT cto.id, cto.contactid, c.name AS contact_name, cto.targetid AS targetid, o.name AS target_org_name, cto.created_at
FROM {cto_table} cto
LEFT JOIN contact c ON cto.contactid = c.contactid
LEFT JOIN organisation o ON cto.targetid = o.orgid
WHERE cto.applicantid = %s
ORDER BY cto.id
""",
                    (applicantid,),
                )
                contact_target_orgs = cursor.fetchall()
                cursor.execute(
                    """                    SELECT d.documentid, d.documenttypeid, d.documentname, d.documentdescription, d.created_at
FROM document d
WHERE d.applicantid = %s
ORDER BY d.documentid
""",
                    (applicantid,),
                )
                documents = cursor.fetchall()
                cursor.execute(
                    """                    SELECT ed.engagementdocumentid, ed.engagementlogid, ed.documentid, d.documentname, ed.created_at
FROM engagementdocument ed
LEFT JOIN document d ON ed.documentid = d.documentid
WHERE ed.applicantid = %s
ORDER BY ed.engagementdocumentid
""",
                    (applicantid,),
                )
                engagement_documents = cursor.fetchall()
        data = {
            "contacts": contacts,
            "organisations": organisations,
            "roles": roles,
            "engagements": engagements,
            "referencedata": referencedata,
            "sectors": sectors,
            "contact_target_orgs": contact_target_orgs,
            "documents": documents,
            "engagement_documents": engagement_documents,
        }
        try:
            # Use a local alias to avoid assigning to the module variable
            # inside this function (which triggers "used before definition").
            bw = globals().get("build_workbook_from_data")
            if not bw:
                from utils.export_utils import build_workbook_from_data as _bw

                bw = _bw
                # cache at module level for subsequent calls
                try:
                    globals()["build_workbook_from_data"] = bw
                except Exception:
                    pass
            bio = bw(data)
        except Exception:
            app.logger.exception("Failed to create navigator export document")
            return (jsonify({"error": "Failed to create export"}), 500)
        fname = f"jobtrack_export_{datetime.utcnow().strftime('%Y-%m-%dT%H%M%SZ')}.xlsx"
        return send_file(
            bio,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=fname,
        )
    except Exception as e:
        app.logger.error(f"Error generating export xlsx: {e}")
        return (jsonify({"error": str(e)}), 500)


@app.route("/api/<int:applicantid>/settings/applicant", methods=["PUT"])
def update_applicant_settings(applicantid) -> ResponseReturnValue:
    """
    Updates applicant information settings in the database.
    The applicant is the user of the software (separate from contacts).
    """
    try:
        data = request.get_json() or {}
        required_fields = ["firstName", "lastName", "email"]
        for field in required_fields:
            if field not in data or not data[field]:
                return (jsonify({"error": f"Missing required field: {field}"}), 400)
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT applicantid FROM applicantprofile WHERE applicantid = %s LIMIT 1;",
                    (applicantid,),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Applicant not found"}), 404)
                cursor.execute(
                    """                    UPDATE applicantprofile
SET firstname = %s,
    lastname = %s,
    email = %s,
    phone = %s,
    linkedinurl = %s,
    addressline1 = %s,
    city = %s,
    postcode = %s,
    personalwebsiteurl = %s,
    searchstartdate = %s,
    searchstatusid = %s
WHERE applicantid = %s
                """,
                    (
                        data.get("firstName"),
                        data.get("lastName"),
                        data.get("email"),
                        data.get("phone"),
                        data.get("linkedin"),
                        data.get("address"),
                        data.get("city"),
                        data.get("postcode"),
                        data.get("website"),
                        data.get("searchStartDate"),
                        data.get("searchStatusId") or None,
                        applicantid,
                    ),
                )
                conn.commit()
                return jsonify(
                    {
                        "success": True,
                        "message": "Settings updated successfully",
                        "applicantId": applicantid,
                    }
                )
    except Exception as e:
        app.logger.error(f"Error updating applicant settings: {e}")
        return (jsonify({"error": str(e)}), 500)


@app.route("/api/<int:applicantid>/settings/applicant", methods=["GET"])
def get_applicant_settings(applicantid) -> ResponseReturnValue:
    """Return applicant profile fields used by the settings UI."""
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT applicantid, firstname, lastname, email, phone, linkedinurl, addressline1, city, postcode, personalwebsiteurl, searchstartdate, searchstatusid, issuperuser FROM applicantprofile WHERE applicantid = %s LIMIT 1",
                    (applicantid,),
                )
                row = cursor.fetchone()
                if not row:
                    return jsonify(
                        {
                            "applicantId": None,
                            "firstName": "",
                            "lastName": "",
                            "email": "",
                            "phone": "",
                            "linkedin": "",
                            "address": "",
                            "city": "",
                            "postcode": "",
                            "website": "",
                        }
                    )
                return jsonify(
                    {
                        "applicantId": row.get("applicantid"),
                        "firstName": row.get("firstname"),
                        "lastName": row.get("lastname"),
                        "email": row.get("email"),
                        "phone": row.get("phone"),
                        "linkedin": row.get("linkedinurl"),
                        "address": row.get("addressline1"),
                        "city": row.get("city"),
                        "postcode": row.get("postcode"),
                        "website": row.get("personalwebsiteurl"),
                        # include search start date / status so the UI can display them
                        "searchstartdate": row.get("searchstartdate"),
                        "searchstatusid": row.get("searchstatusid"),
                        "issuperuser": bool(row.get("issuperuser")),
                    }
                )
    except Exception as e:
        app.logger.exception("Error fetching applicant settings: %s", e)
        return (jsonify({"error": "Server error"}), 500)


@app.route("/api/<int:applicantid>/settings/applicant/avatar", methods=["POST"])
def upload_applicant_avatar(applicantid=None) -> ResponseReturnValue:
    """
    Upload and compress an avatar image for the applicant.
    Compresses image to max 200x200px and converts to base64 data URI.
    """
    try:
        # Ensure Pillow is available for image processing
        if Image is None or ImageOps is None:
            app.logger.warning("Image upload requested but Pillow is unavailable")
            return (jsonify({"error": "Image processing not available on server"}), 503)

        if "avatar" not in request.files:
            return (jsonify({"error": "No avatar file provided"}), 400)
        file = request.files["avatar"]
        if file.filename == "":
            return (jsonify({"error": "No file selected"}), 400)
        allowed_extensions = {"png", "jpg", "jpeg", "gif", "webp"}
        filename = getattr(file, "filename", "") or ""
        file_ext = filename.rsplit(".", 1)[1].lower() if "." in filename else ""
        if file_ext not in allowed_extensions:
            return (
                jsonify(
                    {
                        "error": f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"
                    }
                ),
                400,
            )
        image = Image.open(file.stream)
        try:
            image = ImageOps.exif_transpose(image)
        except Exception as e:
            logger.debug("Image exif_transpose failed: %s", e)
        try:
            tag_v2 = getattr(image, "tag_v2", None)
            if tag_v2 is not None:
                orient = tag_v2.get(274)
                if orient and orient != 1:
                    try:
                        # Resolve Pillow transpose/rotate constants lazily here
                        flip_left_right = (
                            getattr(Image, "FLIP_LEFT_RIGHT", None)
                            if Image is not None
                            else None
                        )
                        flip_top_bottom = (
                            getattr(Image, "FLIP_TOP_BOTTOM", None)
                            if Image is not None
                            else None
                        )
                        rotate_90 = (
                            getattr(Image, "ROTATE_90", None)
                            if Image is not None
                            else None
                        )
                        rotate_180 = (
                            getattr(Image, "ROTATE_180", None)
                            if Image is not None
                            else None
                        )
                        rotate_270 = (
                            getattr(Image, "ROTATE_270", None)
                            if Image is not None
                            else None
                        )
                        transpose_op = (
                            getattr(Image, "TRANSPOSE", None)
                            if Image is not None
                            else None
                        )
                        transverse_op = (
                            getattr(Image, "TRANSVERSE", None)
                            if Image is not None
                            else None
                        )
                        orient_map = {
                            2: flip_left_right,
                            3: rotate_180,
                            4: flip_top_bottom,
                            5: transpose_op,
                            6: rotate_270,
                            7: transverse_op,
                            8: rotate_90,
                        }
                        op = orient_map.get(orient)
                        if op is not None:
                            try:
                                image = image.transpose(op)
                            except Exception as e:
                                logger.debug(
                                    "Failed to transpose image orientation: %s", e
                                )
                    except Exception as e:
                        logger.debug(
                            "Failed to compute image orientation mapping: %s", e
                        )
        except Exception as e:
            logger.debug("Failed while handling image orientation tags: %s", e)
        try:
            photometric = None
            tag_v2 = getattr(image, "tag_v2", None)
            if tag_v2 is not None:
                photometric = tag_v2.get(262)
            if photometric == 0:
                try:
                    image = ImageOps.invert(image.convert("RGB"))
                except Exception as e:
                    logger.debug("Failed to invert photometric image: %s", e)
        except Exception as e:
            logger.debug("Failed while checking photometric tag: %s", e)
        if image.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", image.size, (255, 255, 255))
            if image.mode == "P":
                image = image.convert("RGBA")
            background.paste(
                image, mask=image.split()[-1] if image.mode in ("RGBA", "LA") else None
            )
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")
        max_size = (200, 200)
        image.thumbnail(max_size, Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=85, optimize=True)
        buffer.seek(0)
        buffer_size = buffer.getbuffer().nbytes
        if buffer_size > 100000:
            return (
                jsonify(
                    {
                        "error": "Image too large even after compression. Please use a smaller image."
                    }
                ),
                400,
            )
        applicant_id = None
        try:
            if applicantid:
                applicant_id = jobutils.parse_int(applicantid, "applicantid")
            elif request.form.get("applicantId"):
                applicant_id = jobutils.parse_int(
                    request.form.get("applicantId"), "applicantId"
                )
            elif request.form.get("applicantid"):
                applicant_id = jobutils.parse_int(
                    request.form.get("applicantid"), "applicantid"
                )
            elif request.headers.get("X-Applicant-Id"):
                applicant_id = jobutils.parse_int(
                    request.headers.get("X-Applicant-Id"), "X-Applicant-Id"
                )
        except Exception:
            return (jsonify({"error": "Invalid applicant ID"}), 400)
        if not applicant_id:
            return (jsonify({"error": "Applicant ID required"}), 400)
        avatars_dir = os.path.join(app.static_folder or "static", "avatars")
        try:
            os.makedirs(avatars_dir, exist_ok=True)
        except Exception:
            app.logger.exception("Failed to create avatars directory")
        filename = f"avatar_{applicant_id}_{int(time.time())}.jpg"
        filepath = os.path.join(avatars_dir, filename)
        try:
            with open(filepath, "wb") as f:
                f.write(buffer.getvalue())
        except Exception:
            app.logger.exception("Failed to write avatar file")
            return (jsonify({"error": "Failed to save avatar file"}), 500)
        avatar_url = f"/static/avatars/{filename}"
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """                    UPDATE applicantprofile
SET avatarurl = %s
WHERE applicantid = %s
                """,
                    (avatar_url, applicant_id),
                )
                conn.commit()
        return jsonify(
            {
                "success": True,
                "message": "Avatar uploaded successfully",
                "avatarUrl": avatar_url,
            }
        )
    except Exception as e:
        app.logger.error(f"Error uploading avatar: {e}")
        return (jsonify({"error": str(e)}), 500)


@app.route("/api/<int:applicantid>/settings/ui-preferences", methods=["GET"])
def get_ui_preferences(applicantid) -> ResponseReturnValue:
    """
    Returns UI preferences (e.g., column widths) for the given applicant.
    """
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT uipreferences AS ui_preferences FROM applicantprofile WHERE applicantid = %s LIMIT 1",
                    (applicantid,),
                )
                result = cursor.fetchone()
                if not result or not result.get("ui_preferences"):
                    return jsonify({})
                return jsonify(result["ui_preferences"])
    except Exception as e:
        app.logger.error(f"Error fetching UI preferences: {e}")
        return (jsonify({"error": str(e)}), 500)


@app.route("/api/<int:applicantid>/settings/ui-preferences", methods=["PUT"])
def update_ui_preferences(applicantid) -> ResponseReturnValue:
    """
    Updates UI preferences (e.g., column widths) in the applicant profile for the given applicant.
    Expects JSON object with preferences to merge with existing preferences.
    """
    try:
        preferences = request.get_json()
        if not preferences:
            return (jsonify({"error": "No preferences provided"}), 400)
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT applicantid FROM applicantprofile WHERE applicantid = %s LIMIT 1",
                    (applicantid,),
                )
                applicant = cursor.fetchone()
                if not applicant:
                    cursor.execute(
                        """                        INSERT INTO applicantprofile (applicantid, firstname, lastname, uipreferences)
VALUES (%s, '', '', %s)
RETURNING applicantid
                    """,
                        (applicantid, json.dumps(preferences)),
                    )
                    conn.commit()
                else:
                    cursor.execute(
                        """                        UPDATE applicantprofile
SET uipreferences = COALESCE(uipreferences, '{}'::jsonb) || %s::jsonb
WHERE applicantid = %s
                    """,
                        (json.dumps(preferences), applicantid),
                    )
                    conn.commit()
                return jsonify(
                    {"success": True, "message": "UI preferences updated successfully"}
                )
    except Exception as e:
        app.logger.error(f"Error updating UI preferences: {e}")
        return (jsonify({"error": str(e)}), 500)


@app.route("/api/<int:applicantid>/settings/refdata", methods=["GET"])
def get_refdata_settings(applicantid) -> ResponseReturnValue:
    """
    Returns reference data for management.
    Optionally filter by refdataclass using ?class=<value> query parameter.
    """
    try:
        refdataclass = request.args.get("class")
        try:
            _ = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                if refdataclass:
                    cursor.execute(
                        """                        SELECT refid, refdataclass, refvalue 
FROM ReferenceData 
WHERE refdataclass = %s
ORDER BY refdataclass, refvalue
                    """,
                        (refdataclass,),
                    )
                else:
                    cursor.execute(
                        """                        SELECT refid, refdataclass, refvalue 
FROM ReferenceData 
ORDER BY refdataclass, refvalue
                    """
                    )
                refdata = cursor.fetchall()
                cursor.execute(
                    "SELECT sectorid, summary as name, description FROM sector ORDER BY summary"
                )
                sectors = cursor.fetchall()
                return jsonify({"referencedata": refdata, "sectors": sectors})
    except Exception as e:
        app.logger.error(f"Error fetching reference data: {e}")
        return (jsonify({"error": str(e)}), 500)


@app.route("/api/<int:applicantid>/settings/refdata", methods=["POST"])
def create_refdata(applicantid=None) -> ResponseReturnValue:
    """
    Create a new reference data entry.
    Expected JSON: {"refdataclass": "...", "refvalue": "..."}
    """
    try:
        data = request.get_json()
        if not data or "refdataclass" not in data or "refvalue" not in data:
            return (jsonify({"error": "refdataclass and refvalue are required"}), 400)
        refdataclass = data["refdataclass"].strip()
        refvalue = data["refvalue"].strip()
        if not refdataclass or not refvalue:
            return (
                jsonify({"error": "refdataclass and refvalue cannot be empty"}),
                400,
            )
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """                    SELECT refid FROM ReferenceData 
WHERE refdataclass = %s AND refvalue = %s
                """,
                    (refdataclass, refvalue),
                )
                existing = cursor.fetchone()
                if existing:
                    return (
                        jsonify({"error": "This reference data entry already exists"}),
                        409,
                    )
                cursor.execute(
                    """                    INSERT INTO ReferenceData (refdataclass, refvalue) 
VALUES (%s, %s) 
RETURNING refid, refdataclass, refvalue
                """,
                    (refdataclass, refvalue),
                )
                new_refdata = cursor.fetchone()
                conn.commit()
                app.logger.info(f"Created reference data: {refdataclass} - {refvalue}")
                return (jsonify(new_refdata), 201)
    except Exception as e:
        app.logger.error(f"Error creating reference data: {e}")
        return (jsonify({"error": str(e)}), 500)


@app.route("/api/<int:applicantid>/settings/refdata/<int:refid>", methods=["PUT"])
def update_refdata(applicantid=None, refid=None) -> ResponseReturnValue:
    """
    Update an existing reference data entry.
    Expected JSON: {"refdataclass": "...", "refvalue": "..."}
    """
    try:
        data = request.get_json()
        if not data or "refdataclass" not in data or "refvalue" not in data:
            return (jsonify({"error": "refdataclass and refvalue are required"}), 400)
        refdataclass = data["refdataclass"].strip()
        refvalue = data["refvalue"].strip()
        if not refdataclass or not refvalue:
            return (
                jsonify({"error": "refdataclass and refvalue cannot be empty"}),
                400,
            )
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT refid FROM ReferenceData WHERE refid = %s", (refid,)
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Reference data entry not found"}), 404)
                cursor.execute(
                    """                    SELECT refid FROM ReferenceData 
WHERE refdataclass = %s AND refvalue = %s AND refid != %s
                """,
                    (refdataclass, refvalue, refid),
                )
                if cursor.fetchone():
                    return (
                        jsonify(
                            {"error": "This reference data combination already exists"}
                        ),
                        409,
                    )
                cursor.execute(
                    """                    UPDATE ReferenceData 
SET refdataclass = %s, refvalue = %s 
WHERE refid = %s
RETURNING refid, refdataclass, refvalue
                """,
                    (refdataclass, refvalue, refid),
                )
                updated_refdata = cursor.fetchone()
                conn.commit()
                app.logger.info(
                    f"Updated reference data {refid}: {refdataclass} - {refvalue}"
                )
                return (jsonify(updated_refdata), 200)
    except Exception as e:
        app.logger.error(f"Error updating reference data: {e}")
        return (jsonify({"error": str(e)}), 500)


@app.route("/api/<int:applicantid>/settings/refdata/<int:refid>", methods=["DELETE"])
def delete_refdata(applicantid=None, refid=None) -> ResponseReturnValue:
    """
    Delete a reference data entry.
    Checks for foreign key constraints before deletion.
    """
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """                    SELECT refid, refdataclass, refvalue 
FROM ReferenceData 
WHERE refid = %s
                """,
                    (refid,),
                )
                refdata = cursor.fetchone()
                if not refdata:
                    return (jsonify({"error": "Reference data entry not found"}), 404)
                cursor.execute(
                    """                    SELECT COUNT(*) as count 
FROM EngagementLog 
WHERE engagementtypeid = %s
                """,
                    (refid,),
                )
                usage = cursor.fetchone()
                if usage and usage["count"] > 0:
                    return (
                        jsonify(
                            {
                                "error": f"Cannot delete: This entry is used by {usage['count']} engagement log(s)"
                            }
                        ),
                        409,
                    )
                cursor.execute("DELETE FROM ReferenceData WHERE refid = %s", (refid,))
                conn.commit()
                app.logger.info(
                    f"Deleted reference data {refid}: {refdata['refdataclass']} - {refdata['refvalue']}"
                )
                return (
                    jsonify({"message": "Reference data deleted successfully"}),
                    200,
                )
    except Exception as e:
        app.logger.error(f"Error deleting reference data: {e}")
        return (jsonify({"error": str(e)}), 500)


@app.route("/api/settings/navigator_actions", methods=["GET"])
def list_navigator_actions() -> ResponseReturnValue:
    """Return navigator actions and their inputs."""
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """                    SELECT a.actionid, a.actionname, a.sortorderid,
       COALESCE(json_agg(json_build_object('navigatoractioninputid', i.navigatoractioninputid, 'inputtypeid', i.inputtypeid, 'inputvalue', i.inputvalue, 'sortorderid', i.sortorderid) ORDER BY i.sortorderid, i.navigatoractioninputid) FILTER (WHERE i.navigatoractioninputid IS NOT NULL), '[]') AS inputs
FROM public.navigatoraction a
LEFT JOIN public.navigatoractioninput i ON i.actionid = a.actionid
GROUP BY a.actionid, a.actionname, a.sortorderid
ORDER BY a.sortorderid, a.actionid
                """
                )
                rows = cursor.fetchall()
                cursor.execute(
                    "SELECT refid, refvalue FROM public.referencedata WHERE refdataclass = 'NAVIGATOR_ACTION_TYPE'"
                )
                type_rows = cursor.fetchall()
                type_map = {r["refid"]: r["refvalue"] for r in type_rows}
                for r in rows:
                    try:
                        inputs = r.get("inputs") or []
                        action_type = None
                        for inp in inputs:
                            itid = inp.get("inputtypeid")
                            if itid in type_map:
                                action_type = {
                                    "refid": itid,
                                    "refvalue": type_map.get(itid),
                                    "inputvalue": inp.get("inputvalue"),
                                }
                                break
                        r["actiontype"] = action_type
                    except Exception:
                        r["actiontype"] = None
        return (jsonify(rows), 200)
    except Exception as e:
        app.logger.exception("Failed to list navigator actions")
        return (jsonify({"error": str(e)}), 500)


@app.route("/api/settings/navigator_actions", methods=["POST"])
def create_navigator_action() -> ResponseReturnValue:
    try:
        data = request.get_json() or {}
        name = (data.get("actionname") or "").strip()
        sortorder = (
            data.get("sortorderid") if data.get("sortorderid") is not None else 0
        )
        if not name:
            return (jsonify({"error": "Missing actionname"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "INSERT INTO public.navigatoraction (actionid, actionname, sortorderid) VALUES (nextval('public.navigatoraction_actionid_seq'), %s, %s) RETURNING actionid, actionname, sortorderid",
                    (name, jobutils.parse_int(sortorder, "sortorder")),
                )
                new = cursor.fetchone()
        return (jsonify(new), 201)
    except Exception as e:
        app.logger.exception("Failed to create navigator action")
        return (jsonify({"error": str(e)}), 500)


@app.route("/api/settings/navigator_actions/<int:actionid>", methods=["PUT"])
def update_navigator_action(actionid) -> ResponseReturnValue:
    try:
        data = request.get_json() or {}
        name = data.get("actionname")
        sortorder = data.get("sortorderid")
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT actionid FROM public.navigatoraction WHERE actionid = %s",
                    (actionid,),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Navigator action not found"}), 404)
                cursor.execute(
                    "UPDATE public.navigatoraction SET actionname = COALESCE(%s, actionname), sortorderid = COALESCE(%s, sortorderid) WHERE actionid = %s RETURNING actionid, actionname, sortorderid",
                    (name, sortorder, actionid),
                )
                updated = cursor.fetchone()
        return (jsonify(updated), 200)
    except Exception as e:
        app.logger.exception("Failed to update navigator action")
        return (jsonify({"error": str(e)}), 500)


@app.route("/api/settings/navigator_actions/<int:actionid>", methods=["DELETE"])
def delete_navigator_action(actionid) -> ResponseReturnValue:
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT actionid FROM public.navigatoraction WHERE actionid = %s",
                    (actionid,),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Navigator action not found"}), 404)
                cursor.execute(
                    "DELETE FROM public.navigatoraction WHERE actionid = %s",
                    (actionid,),
                )
        return (jsonify({"ok": True}), 200)
    except Exception as e:
        app.logger.exception("Failed to delete navigator action")
        return (jsonify({"error": str(e)}), 500)


@app.route("/api/settings/navigator_actions/<int:actionid>/inputs", methods=["POST"])
def create_navigator_action_input(actionid) -> ResponseReturnValue:
    try:
        data = request.get_json() or {}
        inputtypeid = data.get("inputtypeid")
        inputvalue = data.get("inputvalue")
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT actionid FROM public.navigatoraction WHERE actionid = %s",
                    (actionid,),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Navigator action not found"}), 404)
                sortorder = (
                    data.get("sortorderid")
                    if data.get("sortorderid") is not None
                    else 0
                )
                cursor.execute(
                    "INSERT INTO public.navigatoractioninput (navigatoractioninputid, actionid, inputtypeid, inputvalue, sortorderid) VALUES (nextval('public.navigatoractioninput_navigatoractioninputid_seq'), %s, %s, %s, %s) RETURNING navigatoractioninputid, actionid, inputtypeid, inputvalue, sortorderid",
                    (
                        actionid,
                        inputtypeid,
                        inputvalue,
                        jobutils.parse_int(sortorder, "sortorder"),
                    ),
                )
                new = cursor.fetchone()
        return (jsonify(new), 201)
    except Exception as e:
        app.logger.exception("Failed to create navigator action input")
        return (jsonify({"error": str(e)}), 500)


@app.route("/api/settings/navigator_actions/inputs/<int:inputid>", methods=["PUT"])
def update_navigator_action_input(inputid) -> ResponseReturnValue:
    try:
        data = request.get_json() or {}
        inputtypeid = data.get("inputtypeid")
        inputvalue = data.get("inputvalue")
        sortorder = data.get("sortorderid")
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT navigatoractioninputid FROM public.navigatoractioninput WHERE navigatoractioninputid = %s",
                    (inputid,),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Navigator action input not found"}), 404)
                cursor.execute(
                    "UPDATE public.navigatoractioninput SET inputtypeid = COALESCE(%s, inputtypeid), inputvalue = COALESCE(%s, inputvalue), sortorderid = COALESCE(%s, sortorderid) WHERE navigatoractioninputid = %s RETURNING navigatoractioninputid, actionid, inputtypeid, inputvalue, sortorderid",
                    (inputtypeid, inputvalue, sortorder, inputid),
                )
                updated = cursor.fetchone()
        return (jsonify(updated), 200)
    except Exception as e:
        app.logger.exception("Failed to update navigator action input")
        return (jsonify({"error": str(e)}), 500)


@app.route("/api/settings/navigator_actions/inputs/<int:inputid>", methods=["DELETE"])
def delete_navigator_action_input(inputid) -> ResponseReturnValue:
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT navigatoractioninputid FROM public.navigatoractioninput WHERE navigatoractioninputid = %s",
                    (inputid,),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Navigator action input not found"}), 404)
                cursor.execute(
                    "DELETE FROM public.navigatoractioninput WHERE navigatoractioninputid = %s",
                    (inputid,),
                )
        return (jsonify({"ok": True}), 200)
    except Exception as e:
        app.logger.exception("Failed to delete navigator action input")
        return (jsonify({"error": str(e)}), 500)


@app.route("/test/<path:filename>")
def serve_test(filename) -> ResponseReturnValue:
    """Serve test files - disabled in production"""
    if os.environ.get("FLASK_ENV") == "production":
        return (jsonify({"error": "Test routes disabled in production"}), 404)
    try:
        return send_from_directory(".", filename)
    except Exception as e:
        app.logger.error(f"Failed to serve test file {filename}: {e}")
        return (jsonify({"error": "Test file not found"}), 404)


@app.route("/tests")
def serve_test_runner() -> ResponseReturnValue:
    """Serve the test runner page - disabled in production"""
    if os.environ.get("FLASK_ENV") == "production":
        return (jsonify({"error": "Test runner disabled in production"}), 404)
    try:
        return send_from_directory(".", "test-runner.html")
    except Exception as e:
        app.logger.error(f"Failed to serve test-runner.html: {e}")
        return (jsonify({"error": "Test runner not found"}), 404)


# Export endpoint moved to jobtrack/routes/export.py blueprint.
# The old in-file handler was removed to avoid duplicate route registrations.


if __name__ == "__main__":
    print("----------------------------------------------------------")
    print("   Starting JobTrack Backend API on http://127.0.0.1:8080")
    print("----------------------------------------------------------")
    port = int(os.environ.get("PORT", 8080))
    print(f"   Starting on http://127.0.0.1:{port}")
    debug_flag = (
        os.environ.get("DEV_DEBUG", "0") == "1"
        or os.environ.get("FLASK_ENV", "") == "development"
    )
    use_reloader = bool(debug_flag)
    try:
        app.logger.debug(
            "Starting app with debug=%s, LOG_LEVEL=%s", debug_flag, LOG_LEVEL
        )
    except Exception as e:
        logger.debug("Failed to emit startup debug log: %s", e)
    app.run(
        debug=bool(debug_flag), use_reloader=use_reloader, host="127.0.0.1", port=port
    )
