import base64
import hashlib
import io
import json
import logging
import os
import re
import traceback
import zipfile
from datetime import datetime
from typing import cast, Sequence

from flask import (
    Blueprint,
    jsonify,
    request,
)
from psycopg2.extras import RealDictCursor
from werkzeug.utils import secure_filename

# Use the centralized DB helpers. Avoid importing `app` here to prevent
# circular imports; `jobtrack_core.db.get_conn` provides the canonical Database
# context manager which delegates to `jobtrack_core.db_core.Database`.
from jobtrack_core import db as jobdb

Database = jobdb.get_conn

logger = logging.getLogger(__name__)

# Try to import our providers module. Log failures to aid diagnosis in test
# environments rather than silently falling back to None.
try:
    # Use a relative import to avoid potential package resolution issues
    from . import providers as _providers
except Exception as e:
    logger.exception("Relative import of jobtrack_navigator_ai.providers failed: %s", e)
    # Fallback to absolute import if relative import fails (covers some test runners)
    try:
        from jobtrack_navigator_ai import providers as _providers
    except Exception as e2:
        logger.exception(
            "Absolute import of jobtrack_navigator_ai.providers failed: %s", e2
        )
        _providers = None

# Note: avoid importing `app` at module import time to prevent circular imports.
# Route handlers import `Database` from `app` inside their function scope when needed.
# Do not assign `Database` here — route handlers import it from `app`
# inside their function scope when needed to avoid circular imports.

navigator_bp = Blueprint("navigator", __name__)

# Cache import check for cryptography to avoid noisy repeated tracebacks when
# the package is not installed in the environment.
_FERNET_IMPORT_CHECKED = False
_FERNET_IMPORT_AVAILABLE = False


# Centralised encryption helpers are provided by `utils.encryption`.
try:
    from utils.encryption import (
        derive_key_from_password as _derive_key_from_password_impl,
    )
    from utils.encryption import get_or_create_user_salt as _get_or_create_user_salt
except Exception:
    # Minimal fallbacks: key derivation and salt lookup when utils not importable.
    def _get_or_create_user_salt(conn_or_connlike, applicantid: int) -> str:
        try:
            if hasattr(conn_or_connlike, "cursor"):
                cur = conn_or_connlike.cursor(cursor_factory=RealDictCursor)
                cur.__enter__()
                cur.execute(
                    "SELECT salt FROM usersalt WHERE applicantid = %s LIMIT 1;",
                    (applicantid,),
                )
                r = cur.fetchone()
                try:
                    cur.__exit__(None, None, None)
                except Exception as e:
                    logger.debug("usersalt cursor __exit__ failed: %s", e)
                if r:
                    sval = (
                        r.get("salt")
                        if isinstance(r, dict)
                        else (r[0] if len(r) > 0 else None)
                    )
                    if sval:
                        return sval
        except Exception as e:
            logger.debug("Failed to read usersalt from navigator DB fallback: %s", e)
        return os.environ.get("JOBTRACK_SALT", f"jobtrack-salt-{applicantid}")

    def _derive_key_from_password_impl(
        password: str, salt: bytes, iterations: int = 200000
    ) -> str:
        if password is None:
            return ""
        try:
            dk = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), salt, iterations, dklen=32
            )
            return base64.b64encode(dk).decode("utf-8")
        except Exception as e:
            logger.debug(
                "Key derivation failed in fallback _derive_key_from_password_impl: %s",
                e,
            )
            return ""

    # Fernet/app-level encryption removed; fallbacks are identity functions so
    # code paths that previously attempted Python-level decrypt will simply
    # return stored values when no DB-side key is present.
    def _encrypt_answer(plaintext: str) -> str:
        return plaintext

    def _decrypt_answer(stored: str | None) -> str | None:
        return stored


# Wrapper that accepts str or bytes salt and delegates to implementation
def _derive_key_from_password(
    password: str, salt: bytes | str, iterations: int = 200000
) -> str:
    if isinstance(salt, str):
        salt = salt.encode("utf-8")
    return _derive_key_from_password_impl(password, salt, iterations)


def _get_navigator_conn():
    """Return a psycopg2 connection to the navigator-specific database.

    This mirrors the pattern used elsewhere in this module (upload_cv)
    where the navigator DB is separate from the main application DB.
    """
    from jobtrack_core.db_core import get_connection

    nav_db = os.environ.get("NAVIGATOR_DB_NAME", "jobtrack_navigator_ai")
    return get_connection(database=nav_db)


def _load_base_prompt(applicantid: int) -> str:
    """Load the BASE_PROMPT value from the navigator DB for use with generate/embed calls.

    Returns an empty string if not found or on error.
    """
    try:
        with _get_navigator_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT promptvalue FROM public.llmprompts WHERE promptname = %s LIMIT 1;",
                    ("BASE_PROMPT",),
                )
                r = cur.fetchone()
                if not r:
                    return ""
                val = (
                    r.get("promptvalue")
                    if isinstance(r, dict)
                    else (r[0] if len(r) > 0 else "")
                )
                return "" if val is None else str(val)
    except Exception:
        logger.exception("Failed to load BASE_PROMPT from navigator DB")
        return ""


def _apply_substitutions(text: str, subs: dict | None) -> str:
    if not text or not subs:
        return text
    out = text
    for k, v in (subs.items() if isinstance(subs, dict) else []):
        try:
            sval = "" if v is None else str(v)
            # replace both {key} and {key_with_spaces} forms (case-insensitive)
            pattern1 = re.compile(r"\{" + re.escape(k) + r"\}", flags=re.IGNORECASE)
            out = pattern1.sub(sval, out)
            alt = k.replace("_", " ")
            if alt != k:
                pattern2 = re.compile(
                    r"\{" + re.escape(alt) + r"\}", flags=re.IGNORECASE
                )
                out = pattern2.sub(sval, out)
        except Exception:
            # best-effort substitution; continue on errors
            continue
    return out


ALLOWED_EXTENSIONS = {"pdf"}
UPLOAD_FOLDER = os.path.join("static", "navigator_uploads")


# helper
def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


# Local, defensive int conversion helper to avoid passing None/Unknown to int()
def _to_int_or(val, default=0):
    """Convert val to int, return default on failure or when val is None."""
    if val is None:
        return default
    try:
        return int(val)
    except Exception:
        try:
            # Try rounding floats
            return int(round(val))
        except Exception:
            return default


def _to_int_nullable(val):
    """Convert val to int, return None on failure or when val is None."""
    if val is None:
        return None
    try:
        return int(val)
    except Exception:
        try:
            return int(round(val))
        except Exception:
            return None


@navigator_bp.route("/api/<int:applicantid>/navigator/prompts", methods=["GET"])
def list_prompts(applicantid):
    from jobtrack_core.request_utils import require_applicant_allowed

    guard = require_applicant_allowed(applicantid)
    if guard:
        return guard
    # Prompt data lives in the navigator DB (separate from main app DB).
    with _get_navigator_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT promptid, promptname, promptvalue, created_at, updated_at FROM public.llmprompts ORDER BY promptname;"
            )
            rows = cur.fetchall()
    return jsonify(rows or []), 200


@navigator_bp.route("/api/<int:applicantid>/navigator/insights", methods=["GET"])
def navigator_insights(applicantid):
    """Compute Navigator Insights metrics for the given applicant.

    Returns JSON: list of { metric, value, unit, thresholds, rag }
    Thresholds are loaded from referencedata (refdataclass = 'nav_insight_metric_thresholds').
    """
    try:
        from app import app as main_app
        from jobtrack_core import db as jobdb
        from jobtrack_core.request_utils import require_applicant_allowed

        # Determine whether the caller requested a forced refresh early so we
        # can safely reference it in diagnostic logs below without risking a
        # use-before-assignment error during import or invocation.
        force_refresh = str(request.args.get("force_refresh") or "").lower() in (
            "1",
            "true",
            "yes",
        )

        # Log entry via main app logger so output is visible in the primary logs
        try:
            main_app.logger.info(
                "Navigator.insights called for applicantid=%s force_refresh=%s",
                applicantid,
                force_refresh,
            )
        except Exception as e:
            logger.debug("main_app.logger.info failed: %s", e)

        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard

        results = []
        # Allow callers to force a fresh computation; otherwise prefer the
        # latest saved snapshot in `applicantmetrichistory` which lives in the
        # navigator-specific database. Use the navigator DB for snapshot reads
        # and writes so we don't rely on the main app DB for this feature.
        force_refresh = str(request.args.get("force_refresh") or "").lower() in (
            "1",
            "true",
            "yes",
        )

        # Probe LLM/provider health early so callers can gracefully degrade UI
        if _providers is not None:
            try:
                prov_health = _providers.provider_health()
            except Exception:
                prov_health = {"ok": True}
        else:
            prov_health = {"ok": True}

        # Try reading the latest snapshot from the navigator DB before doing
        # any expensive computation. Let any errors (including missing table)
        # propagate so they surface to the caller rather than being silently
        # handled.
        if not force_refresh:
            with _get_navigator_conn() as nav_conn:
                with nav_conn.cursor(cursor_factory=RealDictCursor) as nav_cur:
                    # Fetch latest snapshot; then find the first snapshot in that same month
                    nav_cur.execute(
                        "SELECT metricdata, created_at FROM public.applicantmetrichistory WHERE applicantid = %s ORDER BY created_at DESC LIMIT 1",
                        (applicantid,),
                    )
                    latest = nav_cur.fetchone()
                    if latest:
                        metricdata = (
                            latest.get("metricdata")
                            if isinstance(latest, dict)
                            else (latest[0] if len(latest) > 0 else None)
                        )
                        created_at = (
                            latest.get("created_at")
                            if isinstance(latest, dict)
                            else (latest[1] if len(latest) > 1 else None)
                        )

                        # Normalise metricdata to a list
                        try:
                            if isinstance(metricdata, str):
                                latest_metrics = json.loads(metricdata)
                            else:
                                latest_metrics = metricdata or []
                        except Exception:
                            latest_metrics = metricdata or []

                        # Ensure latest_metrics is a list of dicts for downstream access
                        try:
                            latest_metrics = [
                                x for x in (latest_metrics or []) if isinstance(x, dict)
                            ]
                        except Exception:
                            latest_metrics = []

                        # Find the first snapshot in the same month as the latest snapshot
                        # Prefer an earlier snapshot within the same month; if none exists,
                        # fall back to the immediately previous snapshot overall.
                        prev_metrics = []
                        try:
                            if created_at:
                                nav_cur.execute(
                                    "SELECT metricdata FROM public.applicantmetrichistory WHERE applicantid = %s AND date_trunc('month', created_at) = date_trunc('month', %s) ORDER BY created_at ASC LIMIT 1",
                                    (applicantid, created_at),
                                )
                                first_of_month = nav_cur.fetchone()
                                if first_of_month:
                                    pm = (
                                        first_of_month.get("metricdata")
                                        if isinstance(first_of_month, dict)
                                        else (
                                            first_of_month[0]
                                            if len(first_of_month) > 0
                                            else None
                                        )
                                    )
                                    try:
                                        if isinstance(pm, str):
                                            prev_metrics = json.loads(pm)
                                        else:
                                            prev_metrics = pm or []
                                    except Exception:
                                        prev_metrics = pm or []
                                else:
                                    # no earlier first-of-month; fall back to previous snapshot overall
                                    nav_cur.execute(
                                        "SELECT metricdata FROM public.applicantmetrichistory WHERE applicantid = %s ORDER BY created_at DESC LIMIT 2",
                                        (applicantid,),
                                    )
                                    two = nav_cur.fetchall() or []
                                    if len(two) >= 2:
                                        candidate = two[1]
                                        pm = (
                                            candidate.get("metricdata")
                                            if isinstance(candidate, dict)
                                            else (
                                                candidate[0]
                                                if len(candidate) > 0
                                                else None
                                            )
                                        )
                                        try:
                                            if isinstance(pm, str):
                                                prev_metrics = json.loads(pm)
                                            else:
                                                prev_metrics = pm or []
                                        except Exception:
                                            prev_metrics = pm or []
                        except Exception:
                            prev_metrics = []

                        # Compute simple per-metric trend (up/down/flat) where numeric values exist
                        try:
                            prev_map = {
                                p.get("metric"): p
                                for p in (prev_metrics or [])
                                if p and isinstance(p, dict)
                            }
                            for m in latest_metrics or []:
                                try:
                                    key = (
                                        m.get("metric") if isinstance(m, dict) else None
                                    )
                                    prev_m = prev_map.get(key) if key else None
                                    if (
                                        prev_m
                                        and ("value" in prev_m)
                                        and ("value" in m)
                                        and prev_m.get("value") is not None
                                        and m.get("value") is not None
                                    ):
                                        pv = float(prev_m.get("value") or 0)
                                        mv = float(m.get("value") or 0)
                                        delta = mv - pv
                                        # Prefer integer delta when values are whole numbers
                                        try:
                                            if abs(delta - round(delta)) < 1e-9:
                                                dd = _to_int_or(round(delta))
                                            else:
                                                dd = round(delta, 2)
                                        except Exception:
                                            dd = delta
                                        m["trend_delta"] = dd
                                        if abs(mv - pv) < 1e-9:
                                            m["trend"] = "flat"
                                        elif mv > pv:
                                            m["trend"] = "up"
                                        else:
                                            m["trend"] = "down"
                                    else:
                                        # no numeric comparison possible
                                        m["trend"] = None
                                        m["trend_delta"] = None
                                except Exception:
                                    m["trend"] = None
                        except Exception as e:
                            logger.debug(
                                "Failed computing trends for navigator metrics: %s", e
                            )

                        # Attach provider health info so the UI can disable LLM-driven features
                        logger.debug(
                            "Returning cached navigator insights for applicant %s computed_at=%s",
                            applicantid,
                            created_at,
                        )
                        return (
                            jsonify(
                                {
                                    "ok": True,
                                    "metrics": latest_metrics,
                                    "computed_at": created_at,
                                    "llm": prov_health,
                                }
                            ),
                            200,
                        )

        # Compute metrics using the main application database
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Load thresholds
                cur.execute(
                    "SELECT refid, refvalue FROM public.referencedata WHERE refdataclass = 'nav_insight_metric_thresholds'"
                )
                thr_rows = cur.fetchall() or []
                thresholds = {}
                for r in thr_rows:
                    try:
                        rv = r.get("refvalue") if isinstance(r, dict) else r[1]
                        if not rv:
                            continue
                        parsed = json.loads(rv)
                        if isinstance(parsed, dict) and parsed.get("metric"):
                            thresholds[parsed["metric"]] = parsed
                    except Exception:
                        continue

                # Helper to evaluate RAG
                def eval_rag(metric: str, val: float | None):
                    t = thresholds.get(metric)
                    if t is None or val is None:
                        return None
                    # Define which metrics are higher-is-better
                    higher_better = set(
                        [
                            "contacts_with_action_plans",
                            "organisations_with_action_plans",
                            "leads_with_action_plans",
                            "number_of_action_plans",
                            "new_engagements_last_month",
                            "new_contacts_last_month",
                            "new_contacts_from_leads_last_month",
                            "networking_events_last_3_months",
                            "cv_score",
                            "linkedin_profile_score",
                            "navigator_briefing_score",
                        ]
                    )
                    is_higher_better = metric in higher_better
                    try:
                        amber = (
                            float(t.get("amber"))
                            if t.get("amber") is not None
                            else None
                        )
                        green = (
                            float(t.get("green"))
                            if t.get("green") is not None
                            else None
                        )
                    except Exception:
                        return None

                    if is_higher_better:
                        if green is not None and val >= green:
                            return "green"
                        if amber is not None and val >= amber:
                            return "amber"
                        return "red"
                    else:
                        # lower is better
                        if green is not None and val <= green:
                            return "green"
                        if amber is not None and val <= amber:
                            return "amber"
                        return "red"

                aid = _to_int_or(applicantid)

                # Discover document types referenced by configured Navigator actions
                # Look for navigator action inputs whose NAVIGATOR_INPUT_TYPE mentions 'document'
                try:
                    cur.execute(
                        "SELECT refid, refvalue FROM public.referencedata WHERE refdataclass = 'NAVIGATOR_INPUT_TYPE'"
                    )
                    nav_input_rows = cur.fetchall() or []
                    doc_input_refids = [
                        r.get("refid")
                        for r in nav_input_rows
                        if r
                        and r.get("refvalue")
                        and "document" in str(r.get("refvalue")).lower()
                    ]
                except Exception:
                    doc_input_refids = []

                # Only consider DOCUMENT_GET inputs on navigator actions that match metric names.
                # We expect there to be configured actions named exactly like the metrics
                # we want to support: 'cv_score', 'linkedin_profile_score', 'met_no_cv'.
                # Only collect DOCUMENT_GET configured types for LLM-driven metrics.
                # We only consider CV and LinkedIn metrics here; Navigator briefing is DB-driven.
                action_document_types: dict = {
                    "cv_score": [],
                    "linkedin_profile_score": [],
                }
                try:
                    target_metrics = ["cv_score", "linkedin_profile_score"]
                    cur.execute(
                        "SELECT actionid, lower(actionname) as name FROM public.navigatoraction WHERE lower(actionname) = ANY(%s)",
                        (target_metrics,),
                    )
                    act_rows = cur.fetchall() or []
                    actionid_to_name = {}
                    action_ids = []
                    for ar in act_rows:
                        aid_row = (
                            ar.get("actionid")
                            if isinstance(ar, dict)
                            else (ar[0] if len(ar) > 0 else None)
                        )
                        name_row = (
                            ar.get("name")
                            if isinstance(ar, dict)
                            else (ar[1] if len(ar) > 1 else None)
                        )
                        if aid_row and name_row:
                            actionid_to_name[aid_row] = name_row
                            action_ids.append(aid_row)

                    if doc_input_refids and action_ids:
                        cur.execute(
                            "SELECT actionid, inputvalue FROM public.navigatoractioninput WHERE inputtypeid = ANY(%s) AND actionid = ANY(%s) AND inputvalue IS NOT NULL",
                            (doc_input_refids, action_ids),
                        )
                        rows = cur.fetchall() or []
                        for r in rows:
                            # r may be dict or tuple depending on cursor_factory
                            aid = None
                            val = None
                            if isinstance(r, dict):
                                aid = r.get("actionid")
                                val = r.get("inputvalue")
                            elif isinstance(r, (list, tuple)):
                                if len(r) >= 2:
                                    aid = r[0]
                                    val = r[1]
                            if aid and val and aid in actionid_to_name:
                                mname = actionid_to_name.get(aid)
                                if mname in action_document_types:
                                    action_document_types[mname].append(
                                        str(val).strip().lower()
                                    )
                except Exception:
                    # Fall back to empty mapping on any error
                    action_document_types = {
                        "cv_score": [],
                        "linkedin_profile_score": [],
                    }

                # Helper: lookup referencedata refids for a list of lower-case document type names
                def _refids_for_doctype_names(names: list):
                    if not names:
                        return []
                    try:
                        cur.execute(
                            "SELECT refid FROM public.referencedata WHERE lower(refvalue) = ANY(%s)",
                            (names,),
                        )
                        rr = cur.fetchall() or []
                        return [
                            r.get("refid") if isinstance(r, dict) else r[0] for r in rr
                        ]
                    except Exception:
                        return []

                # dormant_contacts
                cur.execute(
                    """
                    SELECT COUNT(*) AS cnt
                    FROM public.contact c
                    WHERE c.applicantid = %s
                      AND NOT EXISTS (SELECT 1 FROM public.engagementlog el WHERE el.contactid = c.contactid AND el.applicantid = c.applicantid)
                    """,
                    (aid,),
                )
                dormant_cnt = cur.fetchone().get("cnt") or 0
                # compute percent relative to total contacts
                cur.execute(
                    "SELECT COUNT(*) AS total FROM public.contact WHERE applicantid = %s",
                    (aid,),
                )
                total_contacts = cur.fetchone().get("total") or 0
                dormant_pct = (
                    (dormant_cnt * 100.0 / total_contacts) if total_contacts else 0.0
                )
                results.append(
                    {
                        "metric": "dormant_contacts",
                        "value": round(dormant_pct, 2),
                        "count": _to_int_or(dormant_cnt),
                        "unit": "percent",
                        "thresholds": thresholds.get("dormant_contacts"),
                        "rag": eval_rag("dormant_contacts", dormant_pct),
                    }
                )

                # active_contacts_not_met
                cur.execute(
                    """
                    SELECT COUNT(*) AS cnt
                    FROM public.contact c
                    WHERE c.applicantid = %s
                      AND EXISTS (SELECT 1 FROM public.engagementlog el WHERE el.contactid = c.contactid AND el.applicantid = c.applicantid)
                      AND NOT EXISTS (
                        SELECT 1 FROM public.engagementlog el2 WHERE el2.contactid = c.contactid AND el2.applicantid = c.applicantid
                          AND (lower(el2.logentry) LIKE '%%meet%%' OR el2.engagementtypeid IN (SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%meet%%'))
                      )
                    """,
                    (aid,),
                )
                acnm_cnt = cur.fetchone().get("cnt") or 0
                acnm_pct = (
                    (acnm_cnt * 100.0 / total_contacts) if total_contacts else 0.0
                )
                results.append(
                    {
                        "metric": "active_contacts_not_met",
                        "value": round(acnm_pct, 2),
                        "count": _to_int_or(acnm_cnt),
                        "unit": "percent",
                        "thresholds": thresholds.get("active_contacts_not_met"),
                        "rag": eval_rag("active_contacts_not_met", acnm_pct),
                    }
                )

                # met_no_cv (meetings without CV) — original heuristic: meeting logs with no CV attached
                cur.execute(
                    """
                    SELECT COUNT(*) AS cnt
                    FROM public.contact c
                    WHERE c.applicantid = %s
                      AND EXISTS (
                        SELECT 1 FROM public.engagementlog el WHERE el.contactid = c.contactid AND (lower(el.logentry) LIKE '%%meet%%' OR el.engagementtypeid IN (SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%meet%%'))
                      )
                      AND NOT EXISTS (
                        SELECT 1 FROM public.engagementdocument ed
                        JOIN public.engagementlog el2 ON el2.engagementlogid = ed.engagementlogid
                        JOIN public.document d ON d.documentid = ed.documentid
                        WHERE el2.contactid = c.contactid
                          AND (lower(d.documentname) LIKE '%%cv%%' OR d.documenttypeid IN (SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%cv%%'))
                      )
                    """,
                    (aid,),
                )
                mnc_cnt = cur.fetchone().get("cnt") or 0
                mnc_pct = (mnc_cnt * 100.0 / total_contacts) if total_contacts else 0.0
                results.append(
                    {
                        "metric": "met_no_cv",
                        "value": round(mnc_pct, 2),
                        "count": _to_int_or(mnc_cnt),
                        "unit": "percent",
                        "thresholds": thresholds.get("met_no_cv"),
                        "rag": eval_rag("met_no_cv", mnc_pct),
                    }
                )

                # not_checked_in_with (last meeting > 3 months)
                cur.execute(
                    """
                    SELECT COUNT(*) AS cnt
                    FROM public.contact c
                    WHERE c.applicantid = %s
                      AND EXISTS (SELECT 1 FROM public.engagementlog el WHERE el.contactid = c.contactid AND (lower(el.logentry) LIKE '%%meet%%' OR el.engagementtypeid IN (SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%meet%%')))
                      AND (
                        SELECT COALESCE(MAX(el2.logdate), '1900-01-01'::date) FROM public.engagementlog el2 WHERE el2.contactid = c.contactid AND (lower(el2.logentry) LIKE '%%meet%%' OR el2.engagementtypeid IN (SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%meet%%'))
                      ) < (current_date - INTERVAL '3 months')
                    """,
                    (aid,),
                )
                ncw_cnt = cur.fetchone().get("cnt") or 0
                ncw_pct = (ncw_cnt * 100.0 / total_contacts) if total_contacts else 0.0
                results.append(
                    {
                        "metric": "not_checked_in_with",
                        "value": round(ncw_pct, 2),
                        "count": _to_int_or(ncw_cnt),
                        "unit": "percent",
                        "thresholds": thresholds.get("not_checked_in_with"),
                        "rag": eval_rag("not_checked_in_with", ncw_pct),
                    }
                )

                # roles_not_followed_up (status = yet to apply)
                cur.execute(
                    "SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%yet to apply%%' LIMIT 1"
                )
                status_row = cur.fetchone()
                status_refid = status_row.get("refid") if status_row else None
                if status_refid:
                    cur.execute(
                        "SELECT COUNT(*) AS cnt FROM public.jobrole jr WHERE jr.applicantid = %s AND jr.statusid = %s",
                        (aid, status_refid),
                    )
                    rnf_cnt = cur.fetchone().get("cnt") or 0
                else:
                    rnf_cnt = 0
                # express as percent of jobroles
                cur.execute(
                    "SELECT COUNT(*) AS total FROM public.jobrole WHERE applicantid = %s",
                    (aid,),
                )
                total_roles = cur.fetchone().get("total") or 0
                rnf_pct = (rnf_cnt * 100.0 / total_roles) if total_roles else 0.0
                results.append(
                    {
                        "metric": "roles_not_followed_up",
                        "value": round(rnf_pct, 2),
                        "count": _to_int_or(rnf_cnt),
                        "unit": "percent",
                        "thresholds": thresholds.get("roles_not_followed_up"),
                        "rag": eval_rag("roles_not_followed_up", rnf_pct),
                    }
                )

                # meetings_undocumented (meeting type with blank comments)
                cur.execute(
                    """
                    SELECT COUNT(*) AS cnt
                    FROM public.engagementlog el
                    WHERE el.applicantid = %s
                      AND (el.logentry IS NULL OR trim(el.logentry) = '')
                      AND el.engagementtypeid IN (SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%meet%%')
                    """,
                    (aid,),
                )
                mu_cnt = cur.fetchone().get("cnt") or 0
                results.append(
                    {
                        "metric": "meetings_undocumented",
                        "value": mu_cnt,
                        "unit": "count",
                        "thresholds": thresholds.get("meetings_undocumented"),
                        "rag": eval_rag("meetings_undocumented", float(mu_cnt)),
                        "count": _to_int_or(mu_cnt),
                    }
                )

                # new_engagements_last_month
                cur.execute(
                    "SELECT COUNT(*) AS cnt FROM public.engagementlog WHERE applicantid = %s AND logdate >= (current_date - INTERVAL '1 month')",
                    (aid,),
                )
                nelm = cur.fetchone().get("cnt") or 0
                results.append(
                    {
                        "metric": "new_engagements_last_month",
                        "value": nelm,
                        "unit": "count",
                        "count": _to_int_or(nelm),
                        "thresholds": thresholds.get("new_engagements_last_month"),
                        "rag": eval_rag("new_engagements_last_month", float(nelm)),
                    }
                )

                # new_contacts_last_month
                cur.execute(
                    "SELECT COUNT(*) AS cnt FROM public.contact WHERE applicantid = %s AND created_at >= (now() - INTERVAL '1 month')",
                    (aid,),
                )
                nclm = cur.fetchone().get("cnt") or 0
                results.append(
                    {
                        "metric": "new_contacts_last_month",
                        "value": nclm,
                        "unit": "count",
                        "count": _to_int_or(nclm),
                        "thresholds": thresholds.get("new_contacts_last_month"),
                        "rag": eval_rag("new_contacts_last_month", float(nclm)),
                    }
                )

                # new_contacts_from_leads_last_month
                cur.execute(
                    "SELECT COUNT(*) AS cnt FROM public.contact WHERE applicantid = %s AND leadid IS NOT NULL AND created_at >= (now() - INTERVAL '1 month')",
                    (aid,),
                )
                ncll = cur.fetchone().get("cnt") or 0
                results.append(
                    {
                        "metric": "new_contacts_from_leads_last_month",
                        "value": ncll,
                        "unit": "count",
                        "count": _to_int_or(ncll),
                        "thresholds": thresholds.get(
                            "new_contacts_from_leads_last_month"
                        ),
                        "rag": eval_rag(
                            "new_contacts_from_leads_last_month", float(ncll)
                        ),
                    }
                )

                # Consolidated action plans metric: count of action plans that have at least one target
                # This replaces the older per-target-type metrics (contacts/orgs/leads with action plans).
                try:
                    cur.execute(
                        "SELECT COUNT(DISTINCT t.taskid) AS cnt FROM public.task t JOIN public.tasktarget tt ON tt.taskid = t.taskid WHERE t.applicantid = %s",
                        (aid,),
                    )
                    number_of_action_plans = cur.fetchone().get("cnt") or 0
                except Exception:
                    number_of_action_plans = 0

                # Use configured thresholds from referencedata for RAG evaluation
                results.append(
                    {
                        "metric": "number_of_action_plans",
                        "value": number_of_action_plans,
                        "unit": "count",
                        "count": _to_int_or(number_of_action_plans),
                        "thresholds": thresholds.get("number_of_action_plans"),
                        "rag": eval_rag(
                            "number_of_action_plans", float(number_of_action_plans)
                        ),
                    }
                )

                # overdue_action_plans
                cur.execute(
                    "SELECT COUNT(*) AS cnt FROM public.task WHERE applicantid = %s AND duedate IS NOT NULL AND duedate < current_date",
                    (aid,),
                )
                overdue_cnt = cur.fetchone().get("cnt") or 0
                results.append(
                    {
                        "metric": "overdue_action_plans",
                        "value": overdue_cnt,
                        "unit": "count",
                        "count": _to_int_or(overdue_cnt),
                        "thresholds": thresholds.get("overdue_action_plans"),
                        "rag": eval_rag("overdue_action_plans", float(overdue_cnt)),
                    }
                )

                # networking_events_last_3_months (heuristic: engagementlog with 'network' in text)
                cur.execute(
                    "SELECT COUNT(*) AS cnt FROM public.engagementlog WHERE applicantid = %s AND logdate >= (current_date - INTERVAL '3 months') AND lower(coalesce(logentry, '')) LIKE '%%network%%'",
                    (aid,),
                )
                net_cnt = cur.fetchone().get("cnt") or 0
                results.append(
                    {
                        "metric": "networking_events_last_3_months",
                        "value": net_cnt,
                        "unit": "count",
                        "count": _to_int_or(net_cnt),
                        "thresholds": thresholds.get("networking_events_last_3_months"),
                        "rag": eval_rag(
                            "networking_events_last_3_months", float(net_cnt)
                        ),
                    }
                )

                # leads_to_be_reviewed (percent of leads without reviewdate)
                cur.execute(
                    "SELECT COUNT(*) AS total FROM public.lead WHERE applicantid = %s",
                    (aid,),
                )
                total_leads = cur.fetchone().get("total") or 0
                cur.execute(
                    "SELECT COUNT(*) AS cnt FROM public.lead WHERE applicantid = %s AND (reviewdate IS NULL OR reviewoutcomeid IS NULL)",
                    (aid,),
                )
                leads_unreviewed = cur.fetchone().get("cnt") or 0
                leads_unrev_pct = (
                    (leads_unreviewed * 100.0 / total_leads) if total_leads else 0.0
                )
                results.append(
                    {
                        "metric": "leads_to_be_reviewed",
                        "value": round(leads_unrev_pct, 2),
                        "count": _to_int_or(leads_unreviewed),
                        "unit": "percent",
                        "thresholds": thresholds.get("leads_to_be_reviewed"),
                        "rag": eval_rag("leads_to_be_reviewed", leads_unrev_pct),
                    }
                )

                # CV score (heuristic: prefer configured Navigator DOCUMENT_GET types, fallback to name/type matching)
                try:
                    cv_names = (
                        action_document_types.get("cv_score", [])
                        if isinstance(action_document_types, dict)
                        else []
                    )
                    cv_refids = _refids_for_doctype_names(cv_names) if cv_names else []
                    if cv_refids:
                        cur.execute(
                            "SELECT COUNT(*) AS cnt FROM public.document WHERE applicantid = %s AND documenttypeid = ANY(%s)",
                            (aid, cv_refids),
                        )
                    else:
                        cur.execute(
                            "SELECT COUNT(*) AS cnt FROM public.document WHERE applicantid = %s AND (lower(coalesce(documentname, '')) LIKE '%%cv%%' OR documenttypeid IN (SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%cv%%'))",
                            (aid,),
                        )
                except Exception:
                    cur.execute(
                        "SELECT COUNT(*) AS cnt FROM public.document WHERE applicantid = %s AND (lower(coalesce(documentname, '')) LIKE '%%cv%%' OR documenttypeid IN (SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%cv%%'))",
                        (aid,),
                    )
                cv_docs = cur.fetchone().get("cnt") or 0
                # Always default LLM-driven fields to 0 until a model response
                # populates them. We do not provide non-zero heuristics here.
                cv_score = 0
                cv_missing = cv_docs == 0

                cv_entry = {
                    "metric": "cv_score",
                    "value": cv_score,
                    "unit": "score",
                    "thresholds": thresholds.get("cv_score"),
                    "rag": eval_rag("cv_score", float(cv_score)),
                    "missing": cv_missing,
                }
                # If provider health indicates LLM unavailable, flag AI as disabled for LLM-driven metrics
                try:
                    if not prov_health.get("ok", True):
                        cv_entry["ai_enabled"] = False
                        cv_entry["ai_status"] = prov_health
                except Exception:
                    logger.exception(
                        "Navigator debug: failed while checking provider health for cv_entry"
                    )
                results.append(cv_entry)

                # LinkedIn profile score — authoritative check by document type
                # Also emit visible info logs to help debug missing documents
                try:
                    try:
                        cur.execute(
                            "SELECT refid, refvalue FROM public.referencedata WHERE refdataclass = 'document_type' ORDER BY refvalue"
                        )
                        rd_rows = cur.fetchall() or []
                        main_app.logger.info(
                            "Navigator debug: referencedata.document_type rows count=%s",
                            len(rd_rows),
                        )
                        main_app.logger.debug(
                            "Navigator debug: referencedata.document_type rows: %s",
                            rd_rows[:50],
                        )
                    except Exception:
                        main_app.logger.exception(
                            "Navigator debug: failed to fetch referencedata.document_type rows"
                        )
                    try:
                        cur.execute(
                            "SELECT documentid, documentname, documenttypeid, created_at FROM public.document WHERE applicantid = %s ORDER BY created_at DESC LIMIT 50",
                            (aid,),
                        )
                        doc_rows = cur.fetchall() or []
                        main_app.logger.info(
                            "Navigator debug: applicant documents (latest %s) for applicantid=%s",
                            len(doc_rows),
                            aid,
                        )
                        main_app.logger.debug(
                            "Navigator debug: applicant documents (latest 50): %s",
                            doc_rows[:50],
                        )
                    except Exception:
                        main_app.logger.exception(
                            "Navigator debug: failed to fetch applicant document rows"
                        )
                except Exception:
                    # fallback to module logger if main_app not available
                    logger.exception(
                        "Navigator debug: unexpected error during document-type debug queries"
                    )

                cur.execute(
                    """
                    SELECT COUNT(documentid) AS cnt
                    FROM public.document d
                    WHERE d.applicantid = %s
                      AND d.documenttypeid IN (
                          SELECT refid FROM public.referencedata
                          WHERE refdataclass = 'document_type' AND lower(refvalue) = lower(%s)
                      )
                    """,
                    (aid, "LinkedIn Profile"),
                )
                ln_docs = cur.fetchone().get("cnt") or 0
                # Always default LinkedIn metric to 0 until the model returns a value.
                ln_score = 0
                ln_missing = ln_docs == 0

                try:
                    logger.debug(
                        "Navigator linkedin check: applicantid=%s ln_docs=%s ln_score=%s ln_missing=%s",
                        aid,
                        ln_docs,
                        ln_score,
                        ln_missing,
                    )
                except Exception:
                    logger.exception(
                        "Navigator debug: failed to emit linkedin check debug log for applicantid=%s",
                        aid,
                    )

                ln_entry = {
                    "metric": "linkedin_profile_score",
                    "value": ln_score,
                    "unit": "score",
                    "thresholds": thresholds.get("linkedin_profile_score"),
                    "rag": eval_rag("linkedin_profile_score", float(ln_score)),
                    "missing": ln_missing,
                }
                try:
                    if not prov_health.get("ok", True):
                        ln_entry["ai_enabled"] = False
                        ln_entry["ai_status"] = prov_health
                except Exception as e:
                    logger.debug(
                        "Navigator: prov_health check failed for ln_entry: %s", e
                    )
                results.append(ln_entry)

                # Navigator briefing score (completeness: proportion of questions answered in latest batch)
                cur.execute(
                    "SELECT DISTINCT batchcreationtimestamp FROM navigatorapplicantbriefing WHERE applicantid = %s ORDER BY batchcreationtimestamp DESC LIMIT 1",
                    (aid,),
                )
                batchrow = cur.fetchone()
                briefing_score_val = 0
                briefing_missing = True
                if batchrow and batchrow.get("batchcreationtimestamp"):
                    batch = batchrow.get("batchcreationtimestamp")
                    cur.execute(
                        "SELECT COUNT(*) AS total FROM navigatorbriefingquestions"
                    )
                    total_q = cur.fetchone().get("total") or 0
                    cur.execute(
                        "SELECT COUNT(*) AS answered FROM navigatorapplicantbriefing WHERE applicantid = %s AND batchcreationtimestamp = %s",
                        (aid, batch),
                    )
                    answered = cur.fetchone().get("answered") or 0
                    briefing_score_val = _to_int_or(
                        (answered * 10.0 / total_q) if total_q else 0
                    )
                    briefing_missing = answered == 0
                results.append(
                    {
                        "metric": "navigator_briefing_score",
                        "value": briefing_score_val,
                        "unit": "score",
                        "thresholds": thresholds.get("navigator_briefing_score"),
                        "rag": eval_rag(
                            "navigator_briefing_score", float(briefing_score_val)
                        ),
                        "missing": briefing_missing,
                    }
                )

                # Compute trend vs latest existing snapshot (if any) so the persisted
                # snapshot and returned metrics include trend information.
                try:
                    with _get_navigator_conn() as nav_conn:
                        with nav_conn.cursor(cursor_factory=RealDictCursor) as nav_cur:
                            # Find the first snapshot earlier in the current month to compare values
                            # Prefer an earlier snapshot within this month; if none exists, fall back
                            # to the immediately previous snapshot overall.
                            nav_cur.execute(
                                "SELECT metricdata, created_at FROM public.applicantmetrichistory WHERE applicantid = %s AND date_trunc('month', created_at) = date_trunc('month', now()) ORDER BY created_at ASC LIMIT 1",
                                (applicantid,),
                            )
                            first_of_month = nav_cur.fetchone()
                            prev_metrics = []
                            if first_of_month:
                                pm = (
                                    first_of_month.get("metricdata")
                                    if isinstance(first_of_month, dict)
                                    else (
                                        first_of_month[0]
                                        if len(first_of_month) > 0
                                        else None
                                    )
                                )
                                try:
                                    if isinstance(pm, str):
                                        prev_metrics = json.loads(pm)
                                    else:
                                        prev_metrics = pm or []
                                except Exception:
                                    prev_metrics = pm or []
                            else:
                                # fallback: use the previous snapshot overall (second row of DESC-ordered list)
                                nav_cur.execute(
                                    "SELECT metricdata FROM public.applicantmetrichistory WHERE applicantid = %s ORDER BY created_at DESC LIMIT 2",
                                    (applicantid,),
                                )
                                two = nav_cur.fetchall() or []
                                if len(two) >= 2:
                                    candidate = two[1]
                                    pm = (
                                        candidate.get("metricdata")
                                        if isinstance(candidate, dict)
                                        else (
                                            candidate[0] if len(candidate) > 0 else None
                                        )
                                    )
                                    try:
                                        if isinstance(pm, str):
                                            prev_metrics = json.loads(pm)
                                        else:
                                            prev_metrics = pm or []
                                    except Exception:
                                        prev_metrics = pm or []

                            # Build map of previous metrics for comparison
                            prev_map = {
                                p.get("metric"): p
                                for p in (prev_metrics or [])
                                if p and isinstance(p, dict)
                            }
                            for m in results:
                                try:
                                    key = m.get("metric")
                                    prev_m = prev_map.get(key)
                                    if (
                                        prev_m
                                        and ("value" in prev_m)
                                        and ("value" in m)
                                        and prev_m.get("value") is not None
                                        and m.get("value") is not None
                                    ):
                                        pv = float(prev_m.get("value") or 0)
                                        mv = float(m.get("value") or 0)
                                        delta = mv - pv
                                        try:
                                            if abs(delta - round(delta)) < 1e-9:
                                                dd = _to_int_or(round(delta))
                                            else:
                                                dd = round(delta, 2)
                                        except Exception:
                                            dd = delta
                                        m["trend_delta"] = dd
                                        if abs(mv - pv) < 1e-9:
                                            m["trend"] = "flat"
                                        elif mv > pv:
                                            m["trend"] = "up"
                                        else:
                                            m["trend"] = "down"
                                    else:
                                        m["trend"] = None
                                        m["trend_delta"] = None
                                except Exception:
                                    m["trend"] = None

                            # Persist the computed metrics snapshot into the navigator DB so
                            # the frontend dropdown can display historic snapshots. This is
                            # best-effort: don't fail the whole request if the navigator DB
                            # is unavailable or the insert fails.
                            nav_cur.execute(
                                "INSERT INTO public.applicantmetrichistory (applicantid, metricdata, created_at, updated_at) VALUES (%s, %s, now(), now()) RETURNING id",
                                (applicantid, json.dumps(results)),
                            )
                            inserted = None
                            try:
                                inserted = nav_cur.fetchone()
                            except Exception:
                                inserted = None
                            try:
                                nav_conn.commit()
                            except Exception as e:
                                logger.debug(
                                    "Failed to commit navigator snapshot: %s", e
                                )
                            try:
                                # Log the insertion result for diagnostics (id or row)
                                if inserted:
                                    logger.info(
                                        "Persisted navigator snapshot for applicant %s: inserted=%s",
                                        applicantid,
                                        inserted,
                                    )
                                else:
                                    logger.info(
                                        "Persisted navigator snapshot for applicant %s: insert returned no row",
                                        applicantid,
                                    )
                            except Exception as e:
                                logger.debug(
                                    "Failed logging navigator snapshot insertion result: %s",
                                    e,
                                )
                except Exception:
                    try:
                        logger.exception(
                            "Failed to persist navigator metrics snapshot into navigator DB for applicant %s",
                            applicantid,
                        )
                    except Exception as e:
                        logger.debug(
                            "Failed while logging navigator snapshot persistence failure: %s",
                            e,
                        )

        try:
            # Emit a concise debug log so devs can inspect what was computed
            try:
                sample = results[:5]
                logger.debug(
                    "Navigator insights computed: metrics_count=%d sample=%s",
                    len(results),
                    json.dumps(sample, default=str),
                )
            except Exception as e:
                logger.debug(
                    "Navigator insights computed: metrics_count=%d (failed to stringify sample): %s",
                    len(results),
                    e,
                )
        except Exception as e:
            logger.debug(
                "Unexpected error while emitting navigator insights debug log: %s", e
            )
        # Include provider health summary so UI can decide to disable chat/AI features
        try:
            out = {"ok": True, "metrics": results, "llm": prov_health}
        except Exception:
            out = {"ok": True, "metrics": results}
        return jsonify(out), 200
    except Exception as e:
        logger.exception("Failed to compute navigator insights: %s", e)
        return jsonify({"error": "Failed to compute navigator insights"}), 500


@navigator_bp.route("/api/<int:applicantid>/navigator/detail", methods=["GET"])
def navigator_detail(applicantid):
    """Return domain rows (contacts, engagements, jobroles, tasks, leads)
    filtered for a given metric.

    Query params:
    - metric: the metric key as returned by `/navigator/insights` (e.g. dormant_contacts)
    - limit: optional integer limit (default 200)

    This endpoint is read-only and scopes results to the applicant. It intentionally
    exposes only a small set of prepared, safe queries to avoid arbitrary SQL.
    """
    try:
        from jobtrack_core import db as jobdb
        from jobtrack_core.request_utils import require_applicant_allowed

        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard

        metric = (request.args.get("metric") or "").strip().lower()
        try:
            limit = _to_int_or(request.args.get("limit") or 200, default=200)
        except Exception:
            limit = 200
        limit = max(1, min(1000, limit))

        if not metric:
            return jsonify({"error": "Missing required query param: metric"}), 400

        aid = _to_int_or(applicantid)
        rows = []

        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Known, safe prepared queries by metric
                if metric == "dormant_contacts":
                    cur.execute(
                        """
                        SELECT c.* FROM public.contact c
                        WHERE c.applicantid = %s
                          AND NOT EXISTS (SELECT 1 FROM public.engagementlog el WHERE el.contactid = c.contactid AND el.applicantid = c.applicantid)
                        ORDER BY c.name NULLS LAST
                        LIMIT %s
                        """,
                        (aid, limit),
                    )
                    rows = cur.fetchall()

                elif metric == "active_contacts_not_met":
                    cur.execute(
                        """
                        SELECT c.* FROM public.contact c
                        WHERE c.applicantid = %s
                          AND EXISTS (SELECT 1 FROM public.engagementlog el WHERE el.contactid = c.contactid AND el.applicantid = c.applicantid)
                          AND NOT EXISTS (
                            SELECT 1 FROM public.engagementlog el2 WHERE el2.contactid = c.contactid AND el2.applicantid = c.applicantid
                              AND (lower(el2.logentry) LIKE '%%meet%%' OR el2.engagementtypeid IN (SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%meet%%'))
                          )
                        ORDER BY c.name NULLS LAST
                        LIMIT %s
                        """,
                        (aid, limit),
                    )
                    rows = cur.fetchall()

                elif metric in ("met_no_cv", "contacts_you_ve_met_but_not_sent_a_cv"):
                    cur.execute(
                        """
                        SELECT DISTINCT c.* FROM public.contact c
                        WHERE c.applicantid = %s
                          AND EXISTS (
                            SELECT 1 FROM public.engagementlog el WHERE el.contactid = c.contactid AND (lower(el.logentry) LIKE '%%meet%%' OR el.engagementtypeid IN (SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%meet%%'))
                          )
                          AND NOT EXISTS (
                            SELECT 1 FROM public.engagementdocument ed
                            JOIN public.engagementlog el2 ON el2.engagementlogid = ed.engagementlogid
                            JOIN public.document d ON d.documentid = ed.documentid
                            WHERE el2.contactid = c.contactid
                              AND (lower(coalesce(d.documentname, '')) LIKE '%%cv%%' OR d.documenttypeid IN (SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%cv%%'))
                          )
                        ORDER BY c.name NULLS LAST
                        LIMIT %s
                        """,
                        (aid, limit),
                    )
                    rows = cur.fetchall()

                elif metric == "not_checked_in_with":
                    cur.execute(
                        """
                        SELECT c.* FROM public.contact c
                        WHERE c.applicantid = %s
                          AND EXISTS (SELECT 1 FROM public.engagementlog el WHERE el.contactid = c.contactid AND (lower(el.logentry) LIKE '%%meet%%' OR el.engagementtypeid IN (SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%meet%%')))
                          AND (
                            SELECT COALESCE(MAX(el2.logdate), '1900-01-01'::date) FROM public.engagementlog el2 WHERE el2.contactid = c.contactid AND (lower(el2.logentry) LIKE '%%meet%%' OR el2.engagementtypeid IN (SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%meet%%'))
                          ) < (current_date - INTERVAL '3 months')
                        ORDER BY c.name NULLS LAST
                        LIMIT %s
                        """,
                        (aid, limit),
                    )
                    rows = cur.fetchall()

                elif metric == "roles_not_followed_up":
                    cur.execute(
                        "SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%yet to apply%%' LIMIT 1"
                    )
                    status_row = cur.fetchone()
                    status_refid = status_row.get("refid") if status_row else None
                    if status_refid:
                        cur.execute(
                            "SELECT * FROM public.jobrole WHERE applicantid = %s AND statusid = %s ORDER BY jobid DESC LIMIT %s",
                            (aid, status_refid, limit),
                        )
                        rows = cur.fetchall()
                    else:
                        rows = []

                elif metric == "meetings_undocumented":
                    cur.execute(
                        """
                        SELECT el.* FROM public.engagementlog el
                        JOIN public.contact c ON c.contactid = el.contactid
                        WHERE el.applicantid = %s
                          AND (el.logentry IS NULL OR trim(el.logentry) = '')
                          AND el.engagementtypeid IN (SELECT refid FROM public.referencedata WHERE lower(refvalue) LIKE '%%meet%%')
                        ORDER BY el.logdate DESC
                        LIMIT %s
                        """,
                        (aid, limit),
                    )
                    rows = cur.fetchall()

                elif metric == "new_engagements_last_month":
                    cur.execute(
                        "SELECT * FROM public.engagementlog WHERE applicantid = %s AND logdate >= (current_date - INTERVAL '1 month') ORDER BY logdate DESC LIMIT %s",
                        (aid, limit),
                    )
                    rows = cur.fetchall()

                elif metric == "new_contacts_last_month":
                    cur.execute(
                        "SELECT * FROM public.contact WHERE applicantid = %s AND created_at >= (now() - INTERVAL '1 month') ORDER BY created_at DESC LIMIT %s",
                        (aid, limit),
                    )
                    rows = cur.fetchall()

                elif metric == "new_contacts_from_leads_last_month":
                    cur.execute(
                        "SELECT * FROM public.contact WHERE applicantid = %s AND leadid IS NOT NULL AND created_at >= (now() - INTERVAL '1 month') ORDER BY created_at DESC LIMIT %s",
                        (aid, limit),
                    )
                    rows = cur.fetchall()

                elif metric == "number_of_action_plans":
                    cur.execute(
                        "SELECT t.* FROM public.task t JOIN public.tasktarget tt ON tt.taskid = t.taskid WHERE t.applicantid = %s GROUP BY t.taskid ORDER BY t.duedate NULLS LAST LIMIT %s",
                        (aid, limit),
                    )
                    rows = cur.fetchall()

                elif metric == "overdue_action_plans":
                    cur.execute(
                        "SELECT * FROM public.task WHERE applicantid = %s AND duedate IS NOT NULL AND duedate < current_date ORDER BY duedate ASC LIMIT %s",
                        (aid, limit),
                    )
                    rows = cur.fetchall()

                elif metric == "networking_events_last_3_months":
                    cur.execute(
                        "SELECT * FROM public.engagementlog WHERE applicantid = %s AND logdate >= (current_date - INTERVAL '3 months') AND lower(coalesce(logentry, '')) LIKE '%%network%%' ORDER BY logdate DESC LIMIT %s",
                        (aid, limit),
                    )
                    rows = cur.fetchall()

                elif metric == "leads_to_be_reviewed":
                    cur.execute(
                        "SELECT * FROM public.lead WHERE applicantid = %s AND (reviewdate IS NULL OR reviewoutcomeid IS NULL) ORDER BY created_at DESC LIMIT %s",
                        (aid, limit),
                    )
                    rows = cur.fetchall()

                else:
                    return (
                        jsonify(
                            {"error": f"Unsupported metric for detail view: {metric}"}
                        ),
                        400,
                    )

        return jsonify({"ok": True, "metric": metric, "rows": rows}), 200
    except Exception as e:
        logger.exception("Failed to fetch navigator detail rows: %s", e)
        return jsonify({"error": "Failed to fetch detail rows"}), 500


@navigator_bp.route("/api/<int:applicantid>/navigator/health", methods=["GET"])
def navigator_health(applicantid):
    """Return a small health/status summary for the configured LLM/provider.

    This is an inexpensive probe that UI can call to decide whether to enable
    chat and LLM-driven insights. Response shape: { ok: bool, llm: { ... } }
    """
    try:
        # No applicant guard required for service health, but keep scoping consistent
        from jobtrack_core.request_utils import require_applicant_allowed

        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
    except Exception:
        # ignore guard failures for health probe
        pass
    try:
        from jobtrack_navigator_ai import providers

        h = providers.provider_health()
        return jsonify({"ok": h.get("ok", False), "llm": h}), 200
    except Exception as e:
        logger.exception("Navigator health probe failed: %s", e)
        return (
            jsonify(
                {
                    "ok": False,
                    "llm": {"ok": False, "error": "unexpected", "message": str(e)},
                }
            ),
            500,
        )


@navigator_bp.route("/api/<int:applicantid>/navigator/metricshistory", methods=["GET"])
def navigator_metric_history(applicantid):
    """Return list of saved metric snapshots for an applicant.

    Response: { ok: true, history: [{ id, created_at }] }
    """
    try:
        from jobtrack_core.request_utils import require_applicant_allowed

        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard

        try:
            with _get_navigator_conn() as nav_conn:
                with nav_conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        "SELECT id, created_at FROM public.applicantmetrichistory WHERE applicantid = %s ORDER BY created_at DESC LIMIT 100",
                        (applicantid,),
                    )
                    rows = cur.fetchall() or []

            # normalize rows to simple dicts with id and created_at
            out = []
            for r in rows:
                if isinstance(r, dict):
                    out.append({"id": r.get("id"), "created_at": r.get("created_at")})
                elif isinstance(r, (list, tuple)):
                    out.append({"id": r[0], "created_at": r[1] if len(r) > 1 else None})

            return jsonify({"ok": True, "history": out}), 200
        except Exception as e:
            # If the navigator history table doesn't exist, return empty history
            # rather than raising a 500. Log the error for diagnostics.
            try:
                logger.exception("Failed to list navigator metric history: %s", e)
            except Exception as ex:
                logger.debug(
                    "Failed while logging navigator metric history exception: %s", ex
                )
            # If it's an undefined table, return empty history; otherwise return 500
            if hasattr(e, "pgcode") and str(e).lower().find("does not exist") != -1:
                return (
                    jsonify(
                        {
                            "ok": True,
                            "history": [],
                            "message": "metric history table not present in navigator DB",
                        }
                    ),
                    200,
                )
            return jsonify({"error": "Failed to list metric history"}), 500
    except Exception as e:
        logger.exception("Failed to list navigator metric history: %s", e)
        return jsonify({"error": "Failed to list metric history"}), 500


@navigator_bp.route(
    "/api/<int:applicantid>/navigator/metricshistory/<int:snapshot_id>", methods=["GET"]
)
def navigator_metric_snapshot(applicantid, snapshot_id):
    """Return a single saved metric snapshot by id for the applicant.

    Response: { ok: true, id, created_at, metrics }
    """
    try:
        from jobtrack_core.request_utils import require_applicant_allowed

        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard

        try:
            with _get_navigator_conn() as nav_conn:
                with nav_conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        "SELECT id, metricdata, created_at FROM public.applicantmetrichistory WHERE id = %s AND applicantid = %s LIMIT 1",
                        (snapshot_id, applicantid),
                    )
                    row = cur.fetchone()

            if not row:
                return jsonify({"error": "Snapshot not found"}), 404

            # metricdata may be returned as JSON/dict or as a JSON string depending on driver
            md = None
            if isinstance(row, dict):
                md = row.get("metricdata")
                created_at = row.get("created_at")
                rid = row.get("id")
            else:
                # fallback to tuple-like
                rid = row[0] if len(row) > 0 else snapshot_id
                md = row[1] if len(row) > 1 else None
                created_at = row[2] if len(row) > 2 else None

            try:
                if isinstance(md, str):
                    metrics = json.loads(md)
                else:
                    metrics = md
            except Exception:
                metrics = md

            return (
                jsonify(
                    {
                        "ok": True,
                        "id": rid,
                        "created_at": created_at,
                        "metrics": metrics,
                    }
                ),
                200,
            )
        except Exception as e:
            try:
                logger.exception("Failed to fetch navigator metric snapshot: %s", e)
            except Exception as ex:
                logger.debug(
                    "Failed while emitting fetch snapshot exception log: %s", ex
                )
            if hasattr(e, "pgcode") and str(e).lower().find("does not exist") != -1:
                return (
                    jsonify(
                        {"error": "metric history table not present in navigator DB"}
                    ),
                    404,
                )
            return jsonify({"error": "Failed to fetch metric snapshot"}), 500
    except Exception as e:
        logger.exception("Failed to fetch navigator metric snapshot: %s", e)
        return jsonify({"error": "Failed to fetch metric snapshot"}), 500


@navigator_bp.route(
    "/api/<int:applicantid>/navigator/metricshistory/<int:snapshot_id>", methods=["PUT"]
)
def update_navigator_metric_snapshot(applicantid, snapshot_id):
    """Update an existing metric snapshot with new metric data (e.g., LLM results).

    Request body: { metrics: [...] }
    Response: { ok: true, id }
    """
    try:
        from jobtrack_core.request_utils import require_applicant_allowed

        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard

        data = request.get_json() or {}
        metrics = data.get("metrics")

        if not metrics or not isinstance(metrics, list):
            return jsonify({"error": "metrics array is required"}), 400

        try:
            with _get_navigator_conn() as nav_conn:
                with nav_conn.cursor() as cur:
                    # Verify snapshot belongs to this applicant
                    cur.execute(
                        "SELECT id FROM public.applicantmetrichistory WHERE id = %s AND applicantid = %s LIMIT 1",
                        (snapshot_id, applicantid),
                    )
                    row = cur.fetchone()
                    if not row:
                        return jsonify({"error": "Snapshot not found"}), 404

                    # Update the metricdata JSON and updated_at timestamp
                    cur.execute(
                        "UPDATE public.applicantmetrichistory SET metricdata = %s, updated_at = now() WHERE id = %s AND applicantid = %s",
                        (json.dumps(metrics), snapshot_id, applicantid),
                    )
                    nav_conn.commit()

                    try:
                        logger.info(
                            "Updated navigator metric snapshot %s for applicant %s with %d metrics",
                            snapshot_id,
                            applicantid,
                            len(metrics),
                        )
                    except Exception as e:
                        logger.debug(
                            "Failed to emit navigator snapshot update log: %s",
                            e,
                        )

            return jsonify({"ok": True, "id": snapshot_id}), 200

        except Exception as e:
            try:
                logger.exception("Failed to update navigator metric snapshot: %s", e)
            except Exception as ex:
                logger.debug(
                    "Failed while emitting exception log for update snapshot: %s", ex
                )
            return jsonify({"error": "Failed to update metric snapshot"}), 500
    except Exception as e:
        logger.exception("Failed to update navigator metric snapshot: %s", e)
        return jsonify({"error": "Failed to update metric snapshot"}), 500


@navigator_bp.route(
    "/api/<int:applicantid>/navigator/metricshistory/<int:snapshot_id>",
    methods=["PATCH"],
)
def patch_navigator_metric_snapshot(applicantid, snapshot_id):
    """Merge a single metric update into an existing snapshot.

    Request body: { metric: "cv_score", model_score: 8, model_commentary: "..." }
    Response: { ok: true, id }
    """
    try:
        from jobtrack_core.request_utils import require_applicant_allowed

        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard

        data = request.get_json() or {}
        metric_key = data.get("metric")
        model_score = data.get("model_score")
        model_commentary = data.get("model_commentary")

        if not metric_key:
            return jsonify({"error": "metric is required"}), 400

        try:
            with _get_navigator_conn() as nav_conn:
                with nav_conn.cursor(cursor_factory=RealDictCursor) as cur:
                    # Fetch current snapshot
                    cur.execute(
                        "SELECT id, metricdata FROM public.applicantmetrichistory WHERE id = %s AND applicantid = %s LIMIT 1",
                        (snapshot_id, applicantid),
                    )
                    row = cur.fetchone()
                    if not row:
                        return jsonify({"error": "Snapshot not found"}), 404

                    # Parse current metrics
                    current_data = (
                        row.get("metricdata") if isinstance(row, dict) else row[1]
                    )
                    if isinstance(current_data, str):
                        metrics = json.loads(current_data)
                    else:
                        metrics = current_data if current_data else []

                    # Find and update the specific metric
                    found = False
                    for m in metrics:
                        if m.get("metric") == metric_key:
                            if model_score is not None:
                                m["model_score"] = model_score
                            if model_commentary is not None:
                                m["model_commentary"] = model_commentary
                            found = True
                            break

                    if not found:
                        # Metric not in snapshot yet - this shouldn't happen but handle gracefully
                        logger.warning(
                            "Metric %s not found in snapshot %s, skipping update",
                            metric_key,
                            snapshot_id,
                        )
                        return (
                            jsonify(
                                {
                                    "ok": True,
                                    "id": snapshot_id,
                                    "warning": "metric not found",
                                }
                            ),
                            200,
                        )

                    # Save updated metrics
                    cur.execute(
                        "UPDATE public.applicantmetrichistory SET metricdata = %s, updated_at = now() WHERE id = %s AND applicantid = %s",
                        (json.dumps(metrics), snapshot_id, applicantid),
                    )
                    nav_conn.commit()

                    try:
                        logger.info(
                            "Patched metric %s in snapshot %s for applicant %s",
                            metric_key,
                            snapshot_id,
                            applicantid,
                        )
                    except Exception as e:
                        logger.debug("Failed to emit navigator patch log: %s", e)

            return jsonify({"ok": True, "id": snapshot_id}), 200

        except Exception as e:
            try:
                logger.exception("Failed to patch navigator metric snapshot: %s", e)
            except Exception as ex:
                logger.debug(
                    "Failed while logging patch navigator metric snapshot exception: %s",
                    ex,
                )
            return jsonify({"error": "Failed to patch metric snapshot"}), 500
    except Exception as e:
        logger.exception("Failed to patch navigator metric snapshot: %s", e)
        return jsonify({"error": "Failed to patch metric snapshot"}), 500


@navigator_bp.route("/api/<int:applicantid>/navigator/prompts", methods=["POST"])
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
    # Create prompt in navigator DB
    with _get_navigator_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "INSERT INTO public.llmprompts (promptname, promptvalue, created_at, updated_at) VALUES (%s, %s, now(), now()) RETURNING promptid;",
                    (name, value),
                )
                row = cur.fetchone()
                conn.commit()
                pid = row[0] if row else None
            except Exception as e:
                logger.exception("Failed to create prompt: %s", e)
                return jsonify({"error": "Failed to create prompt"}), 500
    return jsonify({"ok": True, "promptid": pid}), 201


@navigator_bp.route(
    "/api/<int:applicantid>/navigator/prompts/<int:promptid>", methods=["PUT"]
)
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
    # Update prompt in navigator DB
    with _get_navigator_conn() as conn:
        with conn.cursor() as cur:
            try:
                if name and value:
                    cur.execute(
                        "UPDATE public.llmprompts SET promptname = %s, promptvalue = %s, updated_at = now() WHERE promptid = %s RETURNING promptid;",
                        (name, value, promptid),
                    )
                elif name:
                    cur.execute(
                        "UPDATE public.llmprompts SET promptname = %s, updated_at = now() WHERE promptid = %s RETURNING promptid;",
                        (name, promptid),
                    )
                else:
                    cur.execute(
                        "UPDATE public.llmprompts SET promptvalue = %s, updated_at = now() WHERE promptid = %s RETURNING promptid;",
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


@navigator_bp.route(
    "/api/<int:applicantid>/navigator/prompts/<int:promptid>", methods=["DELETE"]
)
def delete_prompt(applicantid, promptid):
    from jobtrack_core.request_utils import require_applicant_allowed

    guard = require_applicant_allowed(applicantid)
    if guard:
        return guard
    # Delete prompt from navigator DB
    with _get_navigator_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "DELETE FROM public.llmprompts WHERE promptid = %s RETURNING promptid;",
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


# --- Routes without applicantid ---
@navigator_bp.route("/api/navigator/prompts", methods=["GET"])
def list_prompts_global():
    """List prompts without requiring an applicant id (for global admin/API usage)."""
    with _get_navigator_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT promptid, promptname, promptvalue, created_at, updated_at FROM public.llmprompts ORDER BY promptname;"
            )
            rows = cur.fetchall()
    return jsonify(rows or []), 200


@navigator_bp.route("/api/navigator/prompts", methods=["POST"])
def create_prompt_global():
    """Create a prompt without applicant guard."""
    data = request.get_json() or {}
    name = data.get("promptname")
    value = data.get("promptvalue")
    if not name or not value:
        return jsonify({"error": "promptname and promptvalue are required"}), 400
    with _get_navigator_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "INSERT INTO public.llmprompts (promptname, promptvalue, created_at, updated_at) VALUES (%s, %s, now(), now()) RETURNING promptid;",
                    (name, value),
                )
                row = cur.fetchone()
                conn.commit()
                pid = row[0] if row else None
            except Exception as e:
                logger.exception("Failed to create prompt (global): %s", e)
                return jsonify({"error": "Failed to create prompt"}), 500
    return jsonify({"ok": True, "promptid": pid}), 201


@navigator_bp.route("/api/navigator/prompts/<int:promptid>", methods=["PUT"])
def update_prompt_global(promptid):
    """Update a prompt without applicant guard."""
    data = request.get_json() or {}
    name = data.get("promptname")
    value = data.get("promptvalue")
    if not name and not value:
        return jsonify({"error": "Nothing to update"}), 400
    with _get_navigator_conn() as conn:
        with conn.cursor() as cur:
            try:
                if name and value:
                    cur.execute(
                        "UPDATE public.llmprompts SET promptname = %s, promptvalue = %s, updated_at = now() WHERE promptid = %s RETURNING promptid;",
                        (name, value, promptid),
                    )
                elif name:
                    cur.execute(
                        "UPDATE public.llmprompts SET promptname = %s, updated_at = now() WHERE promptid = %s RETURNING promptid;",
                        (name, promptid),
                    )
                else:
                    cur.execute(
                        "UPDATE public.llmprompts SET promptvalue = %s, updated_at = now() WHERE promptid = %s RETURNING promptid;",
                        (value, promptid),
                    )
                row = cur.fetchone()
                if not row:
                    return jsonify({"error": "Not found"}), 404
                conn.commit()
            except Exception as e:
                logger.exception("Failed to update prompt (global): %s", e)
                return jsonify({"error": "Failed to update prompt"}), 500
    return jsonify({"ok": True}), 200


@navigator_bp.route("/api/navigator/prompts/<int:promptid>", methods=["DELETE"])
def delete_prompt_global(promptid):
    """Delete a prompt without applicant guard."""
    with _get_navigator_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "DELETE FROM public.llmprompts WHERE promptid = %s RETURNING promptid;",
                    (promptid,),
                )
                row = cur.fetchone()
                if not row:
                    return jsonify({"error": "Not found"}), 404
                conn.commit()
            except Exception as e:
                logger.exception("Failed to delete prompt (global): %s", e)
                return jsonify({"error": "Failed to delete prompt"}), 500
    return jsonify({"ok": True}), 200


@navigator_bp.route("/api/<int:applicantid>/navigator/upload_cv", methods=["POST"])
def upload_cv(applicantid):
    from jobtrack_core.request_utils import require_applicant_allowed

    guard = require_applicant_allowed(applicantid)
    if guard:
        return guard
    # Dev-time sentinel so console/stdout shows the handler was invoked even if logging isn't configured
    try:
        print(f"UPLOAD_CV handler invoked for applicantid={applicantid}")
    except Exception as e:
        logger.debug("UPLOAD_CV handler print failed: %s", e)
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
        # Try to extract text from PDF (strict - fail loudly on errors)
        # We no longer silently fall back. If extraction fails we return an error
        # so the caller can inspect the failure.
        text_content: str | None = None
        try:
            try:
                from PyPDF2 import PdfReader
            except Exception as e:
                logger.exception("PyPDF2 import failed: %s", e)
                return (
                    jsonify(
                        {
                            "error": "extraction_failed",
                            "details": "PyPDF2 import failed",
                            "exception": str(e),
                            "path": path,
                        }
                    ),
                    500,
                )

            try:
                reader = PdfReader(path)
            except Exception as e:
                logger.exception("Failed to open PDF with PdfReader: %s", e)
                return (
                    jsonify(
                        {
                            "error": "extraction_failed",
                            "details": "Failed to open PDF with PdfReader",
                            "exception": str(e),
                            "path": path,
                        }
                    ),
                    500,
                )

            pages = []
            for i, p in enumerate(reader.pages):
                try:
                    pages.append(p.extract_text() or "")
                except Exception as e:
                    logger.exception("Failed to extract text from page %s: %s", i, e)
                    return (
                        jsonify(
                            {
                                "error": "extraction_failed",
                                "details": f"Failed to extract text from page {i}",
                                "exception": str(e),
                                "path": path,
                            }
                        ),
                        500,
                    )

            text_content = """""".join(pages).strip() or None
        except Exception as e:
            # Any unexpected exception during extraction should fail loudly
            logger.exception("Unexpected error during PDF text extraction: %s", e)
            return (
                jsonify(
                    {
                        "error": "extraction_failed",
                        "details": "Unexpected error during PDF text extraction",
                        "exception": str(e),
                        "path": path,
                    }
                ),
                500,
            )

        # Call embedding provider (pluggable)
        embedding_vector = None
        try:
            from jobtrack_navigator_ai.providers import get_provider

            provider = get_provider()
            # Provider may accept a single string or a list; prefer list interface
            logger.debug(
                "Calling embed provider for applicantid=%s filename=%s",
                applicantid,
                saved_name,
            )
            # Only attempt len() when the value supports __len__ to avoid static analysis
            # warnings about unsubscriptable / unsized objects.
            logger.debug(
                "Extracted text length=%s",
                (
                    len(text_content)
                    if (text_content is not None and hasattr(text_content, "__len__"))
                    else 0
                ),
            )
            try:
                # Narrow the type with an explicit cast so static analyzers (pylint/mypy)
                # know `s` is a `str` before slicing.
                if isinstance(text_content, str) and text_content:
                    s = cast(str, text_content)
                    snippet = s[:200] + (
                        "..." if len(s) > 200 else ""
                    )  # pylint: disable=unsubscriptable-object
                else:
                    snippet = None
                logger.debug("Text preview: %s", snippet)
            except Exception as e:
                logger.debug("Failed to build text preview snippet: %s", e)
            # Include the BASE_PROMPT as a prefix to all encoding calls per policy
            try:
                base = _load_base_prompt(applicantid) or ""
            except Exception as e:
                logger.debug("Failed to load BASE_PROMPT for embedding: %s", e)
                base = ""
            embed_input = ((base + """""") if base else "") + (text_content or "")
            resp = provider.embed([embed_input])
            logger.debug("Embed provider raw response type=%s", type(resp))
            try:
                # Avoid logging huge payloads; show keys or short repr
                if isinstance(resp, dict):
                    logger.debug("Embed provider response keys=%s", list(resp.keys()))
                else:
                    srepr = str(resp)
                    logger.debug(
                        "Embed provider response preview=%s",
                        (srepr[:1000] + ("..." if len(srepr) > 1000 else "")),
                    )
            except Exception as e:
                logger.debug("Failed to preview embed provider response: %s", e)

            # Helper to extract embedding list from provider response
            def _extract_embedding(r):
                if r is None:
                    return None
                # dict with 'data' -> [{'embedding': [...]}, ...]
                if isinstance(r, dict):
                    if (
                        "data" in r
                        and isinstance(r["data"], list)
                        and len(r["data"]) > 0
                    ):
                        first = r["data"][0]
                        if isinstance(first, dict) and "embedding" in first:
                            return first["embedding"]
                        if isinstance(first, list):
                            return first
                    if "embedding" in r and isinstance(r["embedding"], list):
                        return r["embedding"]
                    if (
                        "embeddings" in r
                        and isinstance(r["embeddings"], list)
                        and len(r["embeddings"]) > 0
                    ):
                        return r["embeddings"][0]
                # list responses: either [floats...] or [[floats], ...]
                if isinstance(r, list):
                    if len(r) == 0:
                        return None
                    if isinstance(r[0], (float, int)):
                        return r
                    if (
                        isinstance(r[0], list)
                        and len(r[0]) > 0
                        and isinstance(r[0][0], (float, int))
                    ):
                        return r[0]
                return None

            embedding_vector = _extract_embedding(resp)
            if embedding_vector is not None:
                try:
                    logger.debug("Extracted embedding length=%d", len(embedding_vector))
                except Exception:
                    logger.debug("Extracted embedding (non-list type)")
        except Exception as e:
            logger.exception("Embedding provider failed: %s", e)
            embedding_vector = None

        # Validate embedding dimensionality and choose target table
        expected_dim = _to_int_or(os.environ.get("NAV_EMBED_DIM", "1536"), default=1536)
        target_table = "public.emeddings"
        returning_col = "emeddingid"
        if embedding_vector is not None:
            try:
                vec_len = len(embedding_vector)
            except Exception:
                vec_len = None
            # If the provider returns the expected dimension, use the main emeddings table
            if vec_len is not None and vec_len == expected_dim:
                target_table = "public.emeddings"
                returning_col = "emeddingid"
            # If provider returned a 1024-dim vector and we have a dedicated table, use it
            elif vec_len is not None and vec_len == 1024:
                target_table = "public.embedding_1024"
                returning_col = "embeddingid"
            else:
                logger.error(
                    "Embedding dimension mismatch: expected %s or 1024, got %s",
                    expected_dim,
                    vec_len,
                )
                return (
                    jsonify(
                        {
                            "error": f"Embedding dimension mismatch: expected {expected_dim} or 1024, got {vec_len}"
                        }
                    ),
                    500,
                )

        # Insert into the navigator database's emeddings table if possible
        inserted_id = None
        try:
            from jobtrack_core.db_core import get_connection

            nav_db = os.environ.get("NAVIGATOR_DB_NAME", "jobtrack_navigator_ai")
            with get_connection(database=nav_db) as conn:
                with conn.cursor() as cur:
                    metadata = {"filename": saved_name}
                    if embedding_vector is not None:
                        # Convert to vector literal string: [1,2,3]
                        emb_param = (
                            "["
                            + ",".join([str(float(x)) for x in embedding_vector])
                            + "]"
                        )
                        # Read saved binary file for DB storage
                        try:
                            with open(path, "rb") as fh:
                                file_bytes = fh.read()
                        except Exception:
                            file_bytes = None

                        sql = f"""
                        INSERT INTO {target_table} (applicantid, docid, content, metadata, file_data, embedding, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s::vector, now(), now()) RETURNING {returning_col};
                        """
                        cur.execute(
                            sql,
                            (
                                applicantid,
                                saved_name,
                                text_content,
                                json.dumps(metadata),
                                file_bytes,
                                emb_param,
                            ),
                        )
                    else:
                        # Insert without embedding (placeholder) into the main emeddings table
                        # Read saved binary file for DB storage
                        try:
                            with open(path, "rb") as fh:
                                file_bytes = fh.read()
                        except Exception:
                            file_bytes = None

                        sql = """
                        INSERT INTO public.emeddings (applicantid, docid, content, metadata, file_data, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, now(), now()) RETURNING emeddingid;
                        """
                        cur.execute(
                            sql,
                            (
                                applicantid,
                                saved_name,
                                text_content,
                                json.dumps(metadata),
                                file_bytes,
                            ),
                        )
                    row = cur.fetchone()
                    if row:
                        inserted_id = row[0]
                        # Provide a download URL so the frontend can fetch the binary from DB
                        download_url = None
                        try:
                            download_url = (
                                f"/api/{applicantid}/navigator/document/{saved_name}"
                            )
                        except Exception as e:
                            logger.debug(
                                "Failed to build download_url for embedded doc: %s", e
                            )
        except Exception as e:
            logger.exception("Failed to insert emedding record: %s", e)

        result = {"ok": True, "filename": saved_name, "path": path}
        if "download_url" not in locals():
            download_url = None
        if download_url:
            result["download_url"] = download_url
        result["embedded"] = bool(embedding_vector)
        if inserted_id:
            result["inserted_id"] = inserted_id
            # indicate which table was used for insert so clients can inspect
            result["table"] = (
                target_table if embedding_vector is not None else "public.emeddings"
            )

        return jsonify(result), 201
    return jsonify({"error": "Invalid file type"}), 400


@navigator_bp.route("/api/<int:applicantid>/navigator/exports", methods=["GET"])
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


@navigator_bp.route("/api/<int:applicantid>/navigator/query", methods=["POST"])
def navigator_query(applicantid):
    """Run an Navigator AI-assisted query.

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
    top_k = _to_int_or(body.get("top_k") or 5, default=5)

    # Resolve prompt value from navigator DB if only a name was provided
    resolved_prompt = promptvalue
    if not resolved_prompt and promptname:
        with _get_navigator_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT promptvalue FROM public.llmprompts WHERE promptname = %s LIMIT 1;",
                    (promptname,),
                )
                r = cur.fetchone()
                if r:
                    resolved_prompt = (
                        r.get("promptvalue") if isinstance(r, dict) else r[0]
                    )

    # If neither query_text nor resolved prompt is provided, we still allow
    # the request because the chat prompt (CHAT_PROMPT) may supply instructions.

    # Load the BASE_PROMPT and CHAT_PROMPT and apply simple substitutions when available
    try:
        base = _load_base_prompt(applicantid) or ""
    except Exception:
        base = ""

    chat_prompt = ""
    try:
        with _get_navigator_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT promptvalue FROM public.llmprompts WHERE promptname = %s LIMIT 1;",
                    ("CHAT_PROMPT",),
                )
                r = cur.fetchone()
                if r:
                    chat_prompt = r.get("promptvalue") if isinstance(r, dict) else r[0]
    except Exception as e:
        logger.debug("Failed to load CHAT_PROMPT from navigator DB: %s", e)
        chat_prompt = ""

    # Apply substitutions to base and chat prompt
    if subs:
        try:
            if base:
                base = base.format(**subs)
        except Exception as e:
            logger.debug("Failed to format base prompt with subs: %s", e)
        try:
            if chat_prompt:
                chat_prompt = chat_prompt.format(**subs)
        except Exception as e:
            logger.debug("Failed to format chat_prompt with subs: %s", e)

    # Prefer explicit query_text, then resolved_prompt, but allow empty if chat_prompt supplies instructions
    user_input = query_text or resolved_prompt or ""

    # Compose final prompt: BASE_PROMPT + CHAT_PROMPT + user_input
    parts = []
    if base:
        parts.append(base)
    if chat_prompt:
        parts.append(chat_prompt)
    if user_input:
        parts.append(user_input)
    prompt_to_send = """""".join(parts)

    # Use provider to get a response (provider is pluggable)
    try:
        from jobtrack_navigator_ai.providers import get_provider, provider_health

        provider = get_provider()
        # Check provider health and return a clear error if unavailable
        try:
            h = provider_health()
        except Exception:
            h = {"ok": True}
        if not h.get("ok", True):
            logger.warning("Navigator.query: LLM provider unavailable: %s", h)
            return jsonify({"ok": False, "error": "llm_unreachable", "llm": h}), 503
        # Determine whether the current applicant is a superuser so we only
        # expose token counts to privileged users. require_applicant_allowed
        # has already validated the session applicant matches the route.
        is_superuser = False
        try:
            from jobtrack_core import db as jobdb

            with jobdb.get_conn() as _conn:
                with _conn.cursor(cursor_factory=RealDictCursor) as _cur:
                    _cur.execute(
                        "SELECT issuperuser FROM applicantprofile WHERE applicantid = %s LIMIT 1;",
                        (applicantid,),
                    )
                    ar = _cur.fetchone()
                    if ar and ar.get("issuperuser"):
                        is_superuser = True
        except Exception:
            # On any DB error, default to not exposing token counts
            is_superuser = False
        # If caller provided document_ids, fetch their extracted text and attach
        doc_ids = body.get("document_ids") or []
        attachments = ""
        if doc_ids:
            try:
                docs_text = _fetch_documents_text(applicantid, doc_ids)
                if docs_text:
                    attachments = """--- Attached documents ---
"""
                    for i, d in enumerate(docs_text, start=1):
                        attachments += f"[{i}] documentid={d.get('documentid')} name={d.get('documentname')}\n"
                        attachments += (d.get("text") or "")[:10000] + """"""
            except Exception:
                logger.exception("Failed to fetch attached documents")
        full_prompt = prompt_to_send + (attachments or "")
        # Request token counts from provider only for superusers
        response = provider.generate(
            prompt=full_prompt,
            top_k=top_k,
            stream=False,
            return_token_counts=is_superuser,
        )

        # Normalize the provider response to a text string, preserving token counts when present.
        resp_text = ""
        token_counts = None
        try:
            if isinstance(response, dict):
                # Prefer common textual keys
                for key in ("text", "response", "content", "result"):
                    if key in response and isinstance(response[key], str):
                        resp_text = response[key]
                        break
                # Fallback: stringify nested response field if present
                if (
                    resp_text == ""
                    and "response" in response
                    and response["response"] is not None
                ):
                    try:
                        resp_text = str(response["response"])
                    except Exception:
                        resp_text = json.dumps(response.get("response"))
                try:
                    if "token_counts" in response:
                        token_counts = response.get("token_counts")
                except Exception:
                    token_counts = None
            else:
                resp_text = str(response or "")
        except Exception:
            resp_text = str(response or "")

        # Apply substitutions to provider output so placeholders like '{First Name}' are rendered
        try:
            if subs and isinstance(resp_text, str) and resp_text:
                resp_text = _apply_substitutions(resp_text, subs)
        except Exception:
            # best-effort; fall back to original text on error
            pass

        out = {"ok": True, "response": resp_text}
        if token_counts is not None:
            out["token_counts"] = token_counts
        return jsonify(out), 200
    except Exception as e:
        logger.exception("Navigator query failed: %s", e)
        return jsonify({"error": "Navigator query failed"}), 500


# (Removed static navigator uploads route — not referenced by frontend client)
def _fetch_documents_text(applicantid: int, doc_ids: Sequence[int]) -> list:
    """Fetch documents from the main app DB and attempt to extract readable text.

    Returns a list of dicts: { documentid, documentname, text }

    NOTE: This function does NOT swallow exceptions. If the underlying
    SELECT fails (for example due to a schema mismatch), the exception
    will propagate to the caller so the HTTP handler can return 500.
    """
    if not doc_ids:
        return []

    from jobtrack_core import db as jobdb

    results = []
    logger.debug(
        "Navigator._fetch_documents_text called for applicantid=%s doc_ids=%s",
        applicantid,
        doc_ids,
    )

    # Use canonical column names — let exceptions propagate so callers see them.
    with jobdb.get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT documentid, documentname, documentcontenttype, documentcontent, documentdescription, created_at FROM document WHERE documentid = ANY(%s) AND applicantid = %s;",
                (doc_ids, applicantid),
            )
            rows = cur.fetchall()

    logger.debug(
        "Navigator._fetch_documents_text fetched %s rows for applicantid=%s",
        len(rows or []),
        applicantid,
    )

    for r in rows or []:
        docid = r.get("documentid")
        name = r.get("documentname")
        ctype = r.get("documentcontenttype") or ""
        content = r.get("documentcontent")
        duri = r.get("documentdescription")
        created = r.get("created_at")
        text = ""
        try:
            try:
                clen = (
                    len(content)
                    if content is not None and hasattr(content, "__len__")
                    else (None if content is None else -1)
                )
            except Exception:
                clen = -1

            logger.debug(
                "Navigator: docid=%s name=%s content_type=%s content_length=%s documentdescription=%s created_at=%s",
                docid,
                name,
                ctype,
                clen,
                duri,
                created,
            )

            if (
                (content is None or clen in (0, None))
                and isinstance(duri, str)
                and duri.startswith("file://")
            ):
                logger.debug(
                    "Navigator: document %s has file:// URI and no binary content stored (uri=%s)",
                    docid,
                    duri,
                )

            # Normalize bytes-like content (psycopg2 may return memoryview)
            bcontent = None
            try:
                if isinstance(content, memoryview):
                    bcontent = content.tobytes()
                elif isinstance(content, (bytes, bytearray)):
                    bcontent = bytes(content)
            except Exception:
                bcontent = None

            if bcontent and "pdf" in (ctype or "").lower():
                try:
                    logger.debug(
                        "Navigator: attempting PDF extraction for document %s (bytes=%s)",
                        docid,
                        clen,
                    )
                    from PyPDF2 import PdfReader

                    reader = PdfReader(io.BytesIO(bcontent))
                    pages = []
                    for i, p in enumerate(reader.pages):
                        try:
                            pg_text = p.extract_text() or ""
                            pages.append(pg_text)
                        except Exception as e:
                            logger.exception(
                                "Navigator: failed to extract text from PDF page %s for doc %s: %s",
                                i,
                                docid,
                                e,
                            )
                    text = """""".join(pages).strip()
                    logger.debug(
                        "Navigator: PDF extraction complete for doc %s pages=%s text_len=%s",
                        docid,
                        len(pages),
                        len(text),
                    )
                except Exception as e:
                    logger.exception(
                        "PDF extraction failed for document %s (content_length=%s): %s",
                        docid,
                        clen,
                        e,
                    )
                    logger.debug(
                        "Navigator: PDF exception traceback:\n%s",
                        traceback.format_exc(),
                    )
                    text = ""
            elif bcontent and "zip" in (ctype or "").lower():
                try:
                    logger.debug(
                        "Navigator: attempting ZIP extraction for document %s (bytes=%s)",
                        docid,
                        clen,
                    )
                    z = zipfile.ZipFile(io.BytesIO(bcontent))
                    txts = []
                    for fname in z.namelist():
                        if fname.lower().endswith(".csv") or fname.lower().endswith(
                            ".txt"
                        ):
                            try:
                                b = z.read(fname)
                                txts.append(b.decode("utf-8", errors="replace"))
                            except Exception:
                                logger.exception(
                                    "Navigator: failed to read file %s inside ZIP doc %s",
                                    fname,
                                    docid,
                                )
                                continue
                    text = """""".join(txts)
                    logger.debug(
                        "Navigator: ZIP extraction complete for doc %s files=%s text_len=%s",
                        docid,
                        len(txts),
                        len(text),
                    )
                except Exception as e:
                    logger.exception(
                        "Zip extraction failed for document %s (content_length=%s): %s",
                        docid,
                        clen,
                        e,
                    )
                    logger.debug(
                        "Navigator: ZIP exception traceback:\n%s",
                        traceback.format_exc(),
                    )
                    text = ""
            else:
                if content and isinstance(content, (bytes, bytearray)):
                    logger.debug(
                        "Navigator: document %s has binary content but no extractor for content_type=%s",
                        docid,
                        ctype,
                    )
                text = ""
        except Exception as e:
            logger.exception("Unexpected error reading document %s: %s", docid, e)
            logger.debug(
                "Navigator: unexpected exception traceback:\n%s", traceback.format_exc()
            )

        results.append({"documentid": docid, "documentname": name, "text": text})

    return results


# Applicant-scoped endpoint to fetch extracted document text for navigator UI
@navigator_bp.route(
    "/api/<int:applicantid>/navigator/documents_text", methods=["POST", "OPTIONS"]
)
def navigator_documents_text(applicantid):
    """Return extracted text for a list of document IDs belonging to the applicant.

    Body: { document_ids: [int, ...], applicantid: int }
    Returns: { ok: True, documents: [ { documentid, documentname, text }, ... ] }
    """
    # Handle preflight
    if request.method == "OPTIONS":
        return ("", 200)

    # Validate caller is allowed to act for this applicant
    try:
        from jobtrack_core.request_utils import require_applicant_allowed

        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
    except Exception:
        logger.exception("Navigator: failed to validate applicant access")
        return jsonify({"error": "access validation failed"}), 500

    body = request.get_json(silent=True) or {}
    doc_ids = body.get("document_ids") or []
    logger.debug(
        "Navigator.documents_text request body: applicantid=%s document_ids=%s",
        applicantid,
        doc_ids,
    )
    if not isinstance(doc_ids, (list, tuple)):
        return jsonify({"error": "document_ids must be a list"}), 400

    try:
        docs = _fetch_documents_text(applicantid, doc_ids)
        return jsonify({"ok": True, "documents": docs}), 200
    except Exception:
        logger.exception("Navigator: documents_text handler failed")
        return jsonify({"error": "failed to fetch document text"}), 500


@navigator_bp.route(
    "/api/settings/navigator_briefing_questions/reorder", methods=["PUT", "OPTIONS"]
)
def navigator_briefing_questions_reorder():
    """Admin: bulk update question ordering.

    Accepts a JSON array of objects: [{ questionid: <int>, questionorderindex: <int> }, ...]
    Returns the full ordered list after update.
    """
    if request.method == "OPTIONS":
        return ("", 200)
    try:
        order = request.get_json() or []
        if not isinstance(order, list):
            return (
                jsonify(
                    {"error": "expected a list of {questionid, questionorderindex}"}
                ),
                400,
            )
        from jobtrack_core import db as jobdb

        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                for item in order:
                    try:
                        qid = _to_int_nullable(item.get("questionid"))
                        idx = _to_int_or(
                            item.get("questionorderindex")
                            or item.get("displayorder")
                            or 0,
                            default=0,
                        )
                    except Exception:
                        continue
                    cur.execute(
                        "UPDATE navigatorbriefingquestions SET questionorderindex = %s WHERE questionid = %s;",
                        (idx, qid),
                    )

                # Return the full ordered list after the update
                cur.execute(
                    "SELECT questionid, questiontext, questionorderindex AS displayorder FROM navigatorbriefingquestions ORDER BY questionorderindex, questionid;"
                )
                rows = cur.fetchall()
        return jsonify(rows), 200
    except Exception as e:
        logger.exception("Navigator briefing reorder failed: %s", e)
        return jsonify({"error": "Navigator briefing reorder failed"}), 500


@navigator_bp.route("/api/settings/navigator_briefing_questions", methods=["GET"])
def get_navigator_briefing_questions():
    """Return the list of navigator briefing questions (admin/settings).

    Returns array of { questionid, questiontext, displayorder } ordered by displayorder.
    """
    try:
        from jobtrack_core import db as jobdb

        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT questionid, questiontext, questionorderindex AS displayorder FROM navigatorbriefingquestions ORDER BY questionorderindex, questionid;"
                )
                rows = cur.fetchall()
        return jsonify(rows or []), 200
    except Exception as e:
        logger.exception("Failed to fetch navigator briefing questions: %s", e)
        return jsonify({"error": "Failed to fetch briefing questions"}), 500


@navigator_bp.route(
    "/api/<int:applicantid>/navigator_briefings", methods=["GET", "POST", "OPTIONS"]
)
def applicant_navigator_briefings(applicantid):
    """Applicant-facing: list batches or post a new batch of briefing answers."""
    # Preflight
    if request.method == "OPTIONS":
        return ("", 200)
    try:
        from jobtrack_core import db as jobdb
        from jobtrack_core.request_utils import require_applicant_allowed

        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard

        if request.method == "GET":
            # If batch param provided, return rows for that batch timestamp
            batch = request.args.get("batch")
            try:
                logger.debug(
                    "applicant_navigator_briefings: request applicant=%s batch=%s remote=%s",
                    applicantid,
                    batch,
                    getattr(request, "remote_addr", None),
                )
            except Exception:
                logger.debug(
                    "applicant_navigator_briefings called (unable to read request details)"
                )
            with jobdb.get_conn() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    if batch:
                        # If client supplied a password, use per-applicant salt to derive a key and decrypt via pgcrypto.
                        client_pw = request.args.get("password") or request.args.get(
                            "pw"
                        )
                        if client_pw:
                            # obtain per-applicant salt (create if missing)
                            # use a short transaction to fetch/create salt
                            with conn.cursor():
                                salt = _get_or_create_user_salt(conn, applicantid)
                            derived = _derive_key_from_password(client_pw, salt)
                            # Use pgcrypto to decrypt server-side
                            cur.execute(
                                "SELECT briefingid, questionid, questiontext, pgp_sym_decrypt(decode(questionanswer, 'base64')::bytea, %s)::text AS questionanswer, batchcreationtimestamp FROM navigatorapplicantbriefing WHERE applicantid = %s AND batchcreationtimestamp = %s ORDER BY briefingid;",
                                (derived, applicantid, batch),
                            )
                            rows = cur.fetchall()
                            try:
                                logger.debug(
                                    "navigator_briefings: applicant=%s batch=%s client_pw_used rows=%s",
                                    applicantid,
                                    batch,
                                    len(rows) if rows is not None else 0,
                                )
                            except Exception:
                                logger.debug(
                                    "navigator_briefings: fetched rows (unable to compute length)"
                                )
                            return jsonify(rows), 200

                        # Next, if global key present, use it (admin/legacy flow). Some
                        # legacy rows may contain plaintext or other non-base64 values
                        # in `questionanswer`. Decode only when the stored value is
                        # valid base64 to avoid pgcrypto/`decode(.., 'base64')`
                        # failing with "invalid symbol" errors.
                        pg_key = os.environ.get("JOBTRACK_PG_KEY")
                        if pg_key:
                            # Fetch the raw stored value and perform a per-row
                            # decision about whether to call pgp_sym_decrypt.
                            cur.execute(
                                "SELECT briefingid, questionid, questiontext, questionanswer, batchcreationtimestamp FROM navigatorapplicantbriefing WHERE applicantid = %s AND batchcreationtimestamp = %s ORDER BY briefingid;",
                                (applicantid, batch),
                            )
                            rows = cur.fetchall()
                            out_rows = []
                            for r in rows or []:
                                # Extract stored value depending on cursor result shape
                                if isinstance(r, dict):
                                    raw = r.get("questionanswer")
                                else:
                                    try:
                                        raw = list(r)[3]
                                    except Exception:
                                        raw = None

                                decrypted = None
                                if raw is None:
                                    decrypted = None
                                else:
                                    # If the stored value appears to be valid base64,
                                    # call pgcrypto to decrypt; otherwise treat it as
                                    # legacy/plaintext and pass through application
                                    # level decryption fallback.
                                    try:
                                        # Normalize stored value: strip whitespace/newlines
                                        # and map URL-safe base64 to standard alphabet.
                                        if isinstance(raw, str):
                                            norm = "".join(raw.split())
                                            # map URL-safe chars to standard base64
                                            norm = norm.replace("-", "+").replace(
                                                "_", "/"
                                            )
                                            # pad to multiple of 4
                                            if len(norm) % 4 != 0:
                                                norm += "=" * ((4 - len(norm) % 4) % 4)
                                        else:
                                            norm = raw

                                        # validate base64 (will raise on invalid symbols)
                                        base64.b64decode(norm, validate=True)

                                        # Use a plain cursor for the decryption query so
                                        # fetchone() returns a sequence (avoid RealDictCursor)
                                        with conn.cursor() as dec_cur:
                                            dec_cur.execute(
                                                "SELECT pgp_sym_decrypt(decode(%s, 'base64')::bytea, %s)::text",
                                                (norm, pg_key),
                                            )
                                            dec_row = dec_cur.fetchone()
                                            if isinstance(dec_row, dict):
                                                # unlikely for plain cursor, but handle defensively
                                                decrypted = dec_row.get(
                                                    "pgp_sym_decrypt"
                                                ) or next(iter(dec_row.values()), None)
                                            elif isinstance(dec_row, (list, tuple)):
                                                decrypted = (
                                                    dec_row[0]
                                                    if len(dec_row) > 0
                                                    else None
                                                )
                                            else:
                                                decrypted = dec_row
                                    except Exception:
                                        # Not base64, decryption failed, or key mismatch —
                                        # fallback to application-level decrypt (or identity)
                                        try:
                                            decrypted = _decrypt_answer(raw)
                                        except Exception:
                                            decrypted = raw

                                # Re-compose the output row preserving shape
                                if isinstance(r, dict):
                                    r["questionanswer"] = decrypted
                                    out_rows.append(r)
                                else:
                                    try:
                                        lst = list(r)
                                        # questionanswer is the 4th column in our select
                                        if len(lst) >= 4:
                                            lst[3] = decrypted
                                        out_rows.append(lst)
                                    except Exception:
                                        out_rows.append(r)

                            try:
                                logger.debug(
                                    "navigator_briefings: applicant=%s batch=%s pg_key_used rows=%s",
                                    applicantid,
                                    batch,
                                    len(out_rows) if out_rows is not None else 0,
                                )
                            except Exception:
                                logger.debug(
                                    "navigator_briefings: fetched rows with pg_key (unable to compute length)"
                                )
                            return jsonify(out_rows), 200

                        # Fallback: fetch stored values and attempt Python-level Fernet decrypt
                        cur.execute(
                            "SELECT briefingid, questionid, questiontext, questionanswer, batchcreationtimestamp FROM navigatorapplicantbriefing WHERE applicantid = %s AND batchcreationtimestamp = %s ORDER BY briefingid;",
                            (applicantid, batch),
                        )
                        rows = cur.fetchall()
                        out_rows = []
                        for r in rows or []:
                            if isinstance(r, dict):
                                r_val = r.get("questionanswer")
                                try:
                                    r["questionanswer"] = _decrypt_answer(r_val)
                                except Exception as e:
                                    logger.debug(
                                        "Failed to decrypt briefing answer (dict): %s",
                                        e,
                                    )
                                out_rows.append(r)
                            else:
                                try:
                                    lst = list(r)
                                    lst[3] = _decrypt_answer(lst[3])
                                    out_rows.append(lst)
                                except Exception as e:
                                    logger.debug(
                                        "Failed to decrypt briefing answer (row fallback): %s",
                                        e,
                                    )
                                    out_rows.append(r)
                        try:
                            logger.debug(
                                "navigator_briefings: applicant=%s batch=%s decrypted_rows=%s",
                                applicantid,
                                batch,
                                len(out_rows),
                            )
                        except Exception:
                            logger.debug(
                                "navigator_briefings: returning decrypted rows (unable to compute length)"
                            )
                        return jsonify(out_rows), 200
                    else:
                        # return distinct batch timestamps
                        cur.execute(
                            "SELECT DISTINCT batchcreationtimestamp FROM navigatorapplicantbriefing WHERE applicantid = %s ORDER BY batchcreationtimestamp DESC LIMIT 50;",
                            (applicantid,),
                        )
                        rows = cur.fetchall()
                        batches = [
                            (
                                r.get("batchcreationtimestamp")
                                if isinstance(r, dict)
                                else r[0]
                            )
                            for r in rows
                        ]
                        try:
                            logger.debug(
                                "navigator_briefings: applicant=%s returned_batches=%s",
                                applicantid,
                                len(batches),
                            )
                        except Exception:
                            logger.debug(
                                "navigator_briefings: returning batches (unable to compute length)"
                            )
                        return jsonify(batches), 200

        # POST: create new batch
        body = request.get_json() or {}
        answers = body.get("answers") or []
        if not isinstance(answers, list) or not answers:
            return jsonify({"error": "answers required"}), 400
        batch_ts = datetime.utcnow()
        inserted = []
        # Pre-load question texts so we can snapshot the question text into applicant briefing rows
        qids = list(
            {
                _to_int_nullable(a.get("questionid"))
                for a in answers
                if a.get("questionid") is not None
            }
        )
        # filter out any failed conversions
        qids = [x for x in qids if x is not None]
        qtext_map: dict = {}
        if qids:
            with jobdb.get_conn() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        "SELECT questionid, questiontext FROM navigatorbriefingquestions WHERE questionid = ANY(%s);",
                        (qids,),
                    )
                    qrows = cur.fetchall()
                    for qr in qrows:
                        if isinstance(qr, dict):
                            k = _to_int_nullable(qr.get("questionid"))
                            if k is not None:
                                qtext_map[k] = qr.get("questiontext")
                        else:
                            try:
                                k = _to_int_nullable(qr[0])
                                if k is not None:
                                    qtext_map[k] = qr[1]
                            except Exception:
                                continue

        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Use the single JOBTRACK_PG_KEY passphrase for DB-side encryption
                pg_key = os.environ.get("JOBTRACK_PG_KEY")
                for a in answers:
                    qid = a.get("questionid")
                    ans = a.get("questionanswer")
                    qtext = (
                        qtext_map.get(_to_int_nullable(qid)) if qid is not None else ""
                    )
                    if pg_key:
                        # Use pgcrypto to encrypt on the DB side and store as base64 text
                        cur.execute(
                            "INSERT INTO navigatorapplicantbriefing (applicantid, questionid, questiontext, questionanswer, batchcreationtimestamp) VALUES (%s, %s, %s, encode(pgp_sym_encrypt(%s::text, %s), 'base64'), %s) RETURNING briefingid, applicantid, questionid, questiontext, batchcreationtimestamp;",
                            (applicantid, qid, qtext, ans or "", pg_key, batch_ts),
                        )
                        new = cur.fetchone()
                        if new:
                            # For API response return plaintext (we have it here)
                            if isinstance(new, dict):
                                new["questionanswer"] = ans
                            else:
                                tmp = list(new)
                                tmp.insert(3, ans)
                                new = tmp
                            inserted.append(new)
                    else:
                        # Fallback: application-level Fernet encryptor (or plaintext if unavailable)
                        try:
                            stored_ans = _encrypt_answer(ans)
                        except Exception:
                            stored_ans = ans
                        cur.execute(
                            "INSERT INTO navigatorapplicantbriefing (applicantid, questionid, questiontext, questionanswer, batchcreationtimestamp) VALUES (%s, %s, %s, %s, %s) RETURNING briefingid, applicantid, questionid, questiontext, questionanswer, batchcreationtimestamp;",
                            (applicantid, qid, qtext, stored_ans, batch_ts),
                        )
                        new = cur.fetchone()
                        if new:
                            try:
                                if isinstance(new, dict):
                                    new["questionanswer"] = _decrypt_answer(
                                        new.get("questionanswer")
                                    )
                                else:
                                    tmp = list(new)
                                    tmp[3] = _decrypt_answer(tmp[3])
                                    new = tmp
                            except Exception as e:
                                logger.debug(
                                    "Failed to decrypt newly inserted briefing answer: %s",
                                    e,
                                )
                            inserted.append(new)
        return (
            jsonify(
                {
                    "ok": True,
                    "batchcreationtimestamp": batch_ts.isoformat(),
                    "rows": inserted,
                }
            ),
            201,
        )
    except Exception as e:
        logger.exception("Applicant navigator briefings failed: %s", e)
        return jsonify({"error": "Applicant navigator briefings failed"}), 500


# Navigator-specific export handler removed — export is now handled by core app endpoints.
