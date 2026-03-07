import logging
import os
from datetime import datetime

from flask import Blueprint, jsonify, request, send_from_directory
from psycopg2.extras import RealDictCursor
from werkzeug.utils import secure_filename

logger = logging.getLogger(__name__)
ai_bp = Blueprint("jobtrack_ai", __name__)

ALLOWED_EXTENSIONS = {"pdf"}
UPLOAD_FOLDER = os.path.join("static", "ai_uploads")


# helper
def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@ai_bp.route("/api/<int:applicantid>/ai/prompts", methods=["GET"])
def list_prompts(applicantid):
    from jobtrack_core.request_utils import require_applicant_allowed

    guard = require_applicant_allowed(applicantid)
    if guard:
        return guard
    from jobtrack_core import db as jobdb

    with jobdb.get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT promptid, promptname, promptvalue, created_at, updated_at FROM public.aiprompts ORDER BY promptname;"
            )
            rows = cur.fetchall()
    return jsonify(rows or []), 200


@ai_bp.route("/api/<int:applicantid>/ai/prompts", methods=["POST"])
def create_prompt(applicantid):
    from jobtrack_core.request_utils import require_applicant_allowed

    guard = require_applicant_allowed(applicantid)
    if guard:
        return guard
    data = request.get_json() or {}
    name = data.get("promptname")
    value = data.get("promptvalue")
    if not name or not value:
        return jsonify({"error": "promptname and promptvalue are required"}), 400
    from jobtrack_core import db as jobdb

    with jobdb.get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "INSERT INTO public.aiprompts (promptname, promptvalue, created_at, updated_at) VALUES (%s, %s, now(), now()) RETURNING promptid;",
                    (name, value),
                )
                row = cur.fetchone()
                conn.commit()
                pid = row[0] if row else None
            except Exception as e:
                logger.exception("Failed to create prompt: %s", e)
                return jsonify({"error": "Failed to create prompt"}), 500
    return jsonify({"ok": True, "promptid": pid}), 201


@ai_bp.route("/api/<int:applicantid>/ai/prompts/<int:promptid>", methods=["PUT"])
def update_prompt(applicantid, promptid):
    from jobtrack_core.request_utils import require_applicant_allowed

    guard = require_applicant_allowed(applicantid)
    if guard:
        return guard
    data = request.get_json() or {}
    name = data.get("promptname")
    value = data.get("promptvalue")
    if not name and not value:
        return jsonify({"error": "Nothing to update"}), 400
    from jobtrack_core import db as jobdb

    with jobdb.get_conn() as conn:
        with conn.cursor() as cur:
            try:
                if name and value:
                    cur.execute(
                        "UPDATE public.aiprompts SET promptname = %s, promptvalue = %s, updated_at = now() WHERE promptid = %s RETURNING promptid;",
                        (name, value, promptid),
                    )
                elif name:
                    cur.execute(
                        "UPDATE public.aiprompts SET promptname = %s, updated_at = now() WHERE promptid = %s RETURNING promptid;",
                        (name, promptid),
                    )
                else:
                    cur.execute(
                        "UPDATE public.aiprompts SET promptvalue = %s, updated_at = now() WHERE promptid = %s RETURNING promptid;",
                        (value, promptid),
                    )
                row = cur.fetchone()
                if not row:
                    return jsonify({"error": "Not found"}), 404
                conn.commit()
            except Exception as e:
                logger.exception("Failed to update prompt: %s", e)
                return jsonify({"error": "Failed to update prompt"}), 500
    return jsonify({"ok": True}), 200


@ai_bp.route("/api/<int:applicantid>/ai/prompts/<int:promptid>", methods=["DELETE"])
def delete_prompt(applicantid, promptid):
    from jobtrack_core.request_utils import require_applicant_allowed

    guard = require_applicant_allowed(applicantid)
    if guard:
        return guard
    from jobtrack_core import db as jobdb

    with jobdb.get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "DELETE FROM public.aiprompts WHERE promptid = %s RETURNING promptid;",
                    (promptid,),
                )
                row = cur.fetchone()
                if not row:
                    return jsonify({"error": "Not found"}), 404
                conn.commit()
            except Exception as e:
                logger.exception("Failed to delete prompt: %s", e)
                return jsonify({"error": "Failed to delete prompt"}), 500
    return jsonify({"ok": True}), 200


@ai_bp.route("/api/<int:applicantid>/ai/upload_cv", methods=["POST"])
def upload_cv(applicantid):
    from jobtrack_core.request_utils import require_applicant_allowed

    guard = require_applicant_allowed(applicantid)
    if guard:
        return guard
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename or "")
        target_dir = os.path.join(UPLOAD_FOLDER, str(applicantid))
        os.makedirs(target_dir, exist_ok=True)
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        saved_name = f"{timestamp}_{filename}"
        path = os.path.join(target_dir, saved_name)
        file.save(path)
        # TODO: create vector entry and trigger embedding pipeline asynchronously
        return jsonify({"ok": True, "filename": saved_name, "path": path}), 201
    return jsonify({"error": "Invalid file type"}), 400


@ai_bp.route("/api/<int:applicantid>/ai/exports", methods=["GET"])
def list_exports(applicantid):
    """Return available export endpoints/files for applicant. Clients may call export endpoints to get Excel/CSV files for ingestion."""
    from jobtrack_core.request_utils import require_applicant_allowed

    guard = require_applicant_allowed(applicantid)
    if guard:
        return guard
    # Offer a small set of exports; front-end can use these to fetch CSV/Excel for ingestion.
    exports = [
        {
            "key": "contacts",
            "label": "Contacts (csv)",
            "path": f"/api/{applicantid}/export/contacts",
        },
        {
            "key": "organisations",
            "label": "Organisations (csv)",
            "path": f"/api/{applicantid}/export/organisations",
        },
        {
            "key": "leads",
            "label": "Leads (csv)",
            "path": f"/api/{applicantid}/export/leads",
        },
    ]
    return jsonify(exports), 200


@ai_bp.route("/api/<int:applicantid>/ai/query", methods=["POST"])
def ai_query(applicantid):
    """Run an AI-assisted query.

    Body: { promptname?: string, promptvalue?: string, substitutions?: { token: value }, top_k?: int, query_text?: string }
    """
    from jobtrack_core.request_utils import require_applicant_allowed

    guard = require_applicant_allowed(applicantid)
    if guard:
        return guard
    body = request.get_json() or {}
    promptname = body.get("promptname")
    promptvalue = body.get("promptvalue")
    subs = body.get("substitutions") or {}
    query_text = body.get("query_text") or ""
    top_k = int(body.get("top_k") or 5)

    # Resolve prompt
    resolved_prompt = promptvalue
    from jobtrack_core import db as jobdb

    if not resolved_prompt and promptname:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT promptvalue FROM public.aiprompts WHERE promptname = %s LIMIT 1;",
                    (promptname,),
                )
                r = cur.fetchone()
                if r:
                    resolved_prompt = (
                        r.get("promptvalue") if isinstance(r, dict) else r[0]
                    )
    if not resolved_prompt and not query_text:
        return jsonify({"error": "No prompt or query_text provided"}), 400

    # Simple token substitution
    if resolved_prompt and subs:
        try:
            resolved_prompt = resolved_prompt.format(**subs)
        except Exception as e:
            logger.exception("Failed to apply substitutions: %s", e)

    # Assemble the user input for LLM (ensure string)
    user_input = str(query_text or resolved_prompt or "")

    # Use provider to get a response (provider is pluggable)
    try:
        from ai.providers import get_provider

        provider = get_provider()
        # Step 1: get embeddings for user input and find similar vectors (placeholder)
        # Step 2: optionally retrieve top_k documents from ai_vectors and construct context
        # Step 3: call provider.generate(...) with prompt + context
        # Ensure BASE_PROMPT (if present) is prepended to all generate calls for consistency
        try:
            from jobtrack_core import db as jobdb

            base = ""
            with jobdb.get_conn() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        "SELECT promptvalue FROM public.aiprompts WHERE promptname = %s LIMIT 1;",
                        ("BASE_PROMPT",),
                    )
                    r = cur.fetchone()
                    if r:
                        base = r.get("promptvalue") if isinstance(r, dict) else r[0]
        except Exception as e:
            logger.exception("Failed to load BASE_PROMPT: %s", e)
            base = ""

        # Apply substitutions to base if provided
        if base and subs:
            try:
                base = base.format(**subs)
            except Exception as e:
                logger.exception("Failed to apply substitutions to BASE_PROMPT: %s", e)

        prompt_to_send = ((base + """""") if base else "") + (user_input or "")
        response = provider.generate(
            applicantid=applicantid, prompt=prompt_to_send, top_k=top_k
        )
        return jsonify({"ok": True, "response": response}), 200
    except Exception as e:
        logger.exception("AI query failed: %s", e)
        return jsonify({"error": "AI query failed"}), 500


# Serve uploaded files (read-only)
@ai_bp.route("/static/ai_uploads/<int:applicantid>/<path:filename>", methods=["GET"])
def serve_uploaded(applicantid, filename):
    target_dir = os.path.join(UPLOAD_FOLDER, str(applicantid))
    return send_from_directory(target_dir, filename)
