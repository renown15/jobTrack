import csv
import io
import logging
import os
import re
import zipfile
from datetime import datetime
from typing import Any, List, Optional, Tuple

from flask import Blueprint, jsonify, make_response, request
from psycopg2.extras import RealDictCursor

leads_bp = Blueprint("leads", __name__)

# logger for this module
logger = logging.getLogger(__name__)
# Ensure debug messages are emitted during troubleshooting; production logging config may override.
logger.setLevel(logging.DEBUG)


def _load_lead_column_map() -> List[str]:
    """Parse `database/schema.sql` at import time and build a map of
    normalized column names -> actual column names for the `lead`
    table.

    Normalization removes underscores and lowercases names so callers
    can request either `linkedin_url` or `linkedinurl` and receive the
    authoritative column name as defined in `schema.sql` (for example
    `linkedinurl` and `connectedon`).
    """
    schema_path = os.path.join(os.path.dirname(__file__), "database", "schema.sql")
    try:
        with open(schema_path, "r", encoding="utf-8") as fh:
            data = fh.read()
    except Exception:
        # Fail fast: server is misconfigured if schema.sql is not present
        # or unreadable. This avoids doing runtime information_schema
        # queries which previously expanded attack surface.
        raise RuntimeError(
            "Missing or unreadable database/schema.sql; required for lead import"
        )

    # Find the CREATE TABLE public.lead (...) block
    m = re.search(r"CREATE\s+TABLE\s+public\.lead\s*\((.*?)\)\s*;", data, re.S | re.I)
    if not m:
        raise RuntimeError(
            "Could not locate lead table definition in database/schema.sql"
        )

    block = m.group(1)
    cols = []
    for line in block.splitlines():
        line = line.strip().rstrip(",")
        if not line:
            continue
        # match optional quoted or unquoted identifier at start of line
        mc = re.match(r'^"?([A-Za-z0-9_]+)"?\s+', line)
        if mc:
            cols.append(mc.group(1))

    if not cols:
        raise RuntimeError("No columns found for lead table in schema.sql")

    mapping = [c for c in cols]
    return mapping


# For simplicity and clarity we use the fixed table schema. The lead
# table schema is stable for this application, so hardcode the
# identifiers we need. This avoids runtime discovery complexity.
LINKEDIN_COL = "linkedinurl"
CONNECTED_COL = "connectedon"

# Concrete INSERT column list and placeholders (hardcoded schema)
INSERT_COLUMNS = "(name, linkedinurl, email, company, position, connectedon, reviewoutcomeid, applicantid)"
INSERT_PLACEHOLDERS = "%s, %s, %s, %s, %s, %s, NULL, %s"


# NOTE: Unscoped leads import endpoint removed. Use the scoped
# `/api/<applicantid>/leads/import` route which accepts a POST with a
# multipart/form-data `file` field and form field `applicantid` or a
# URL-scoped applicant id.
def import_leads(applicantid: Optional[int] = None) -> Tuple[Any, int]:
    """Accepts a ZIP file upload containing a CSV (Connections.csv) and imports rows into leads table."""
    logger.debug(
        "Import request content_type=%s content_length=%s",
        request.content_type,
        request.content_length,
    )
    logger.debug("Request files keys: %s", list(request.files.keys()))
    uploaded = request.files.get("file")
    if uploaded:
        try:
            fname = uploaded.filename
        except Exception:
            fname = None
        logger.debug("Uploaded file param present: filename=%s", fname)
    if not uploaded:
        return jsonify({"error": "Missing file"}), 400

    data = uploaded.read()
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return jsonify({"error": "Not a zip file"}), 400

    # Find first CSV file (case-insensitive) or named Connections.csv
    csv_name = None
    for name in z.namelist():
        if name.lower().endswith(".csv"):
            csv_name = name
            # prefer Connections.csv if present
            if name.lower().endswith("connections.csv"):
                csv_name = name
                break

    if not csv_name:
        logger.warning("No CSV file found in uploaded ZIP")
        return jsonify({"error": "No CSV found in archive"}), 400

    # Read CSV contents
    logger.info("Opening CSV %s from uploaded ZIP", csv_name)
    f = z.open(csv_name)
    try:
        # Read all text (small CSVs expected) so we can scan for header row
        text = io.TextIOWrapper(f, encoding="utf-8-sig")
        raw = text.read().splitlines()
        logger.debug("Read %d lines from CSV", len(raw))

        # Heuristic: scan the first N lines to find the header row. Many LinkedIn
        # exports include a short preamble before the actual column header.
        header_keywords = [
            "name",
            "full",
            "first",
            "last",
            "email",
            "company",
            "employer",
            "position",
            "title",
            "profile",
            "profileurl",
            "linkedin",
            "connected",
            "connection",
            "date",
        ]
        max_scan = min(50, len(raw))
        best_idx = None
        best_score = 0
        best_tokens = None

        for i in range(max_scan):
            line = raw[i]
            # skip empty lines
            if not line or not line.strip():
                continue
            try:
                tokens = next(csv.reader([line]))
            except Exception:
                continue
            if not tokens:
                continue
            # normalize tokens to simple lowercase alnum strings
            norm = [re.sub("[^0-9a-z]", "", (t or "").lower()) for t in tokens]
            # score by number of tokens matching header keywords
            score = 0
            for t in norm:
                for k in header_keywords:
                    if k in t and len(t) >= 2:
                        score += 1
                        break
            # prefer lines with more tokens and higher score
            if score > best_score or (
                score == best_score
                and (best_tokens is None or len(tokens) > len(best_tokens))
            ):
                best_score = score
                best_idx = i
                best_tokens = tokens

        # If we found a reasonable header (score >= 1), use it; otherwise fall back to first non-empty line
        header_index = None
        if best_idx is not None and best_score >= 1:
            header_index = best_idx
            logger.debug(
                "Detected header at line %d with score %d: %s",
                header_index,
                best_score,
                best_tokens,
            )
        else:
            # fallback: find first line that looks like header (contains at least 2 non-empty comma-separated values)
            for i in range(max_scan):
                line = raw[i]
                if not line or not line.strip():
                    continue
                try:
                    tokens = next(csv.reader([line]))
                except Exception:
                    continue
                nonempty = [t for t in tokens if (t or "").strip()]
                if len(nonempty) >= 2:
                    header_index = i
                    logger.debug(
                        "Fallback header chosen at line %d: %s", header_index, tokens
                    )
                    break

        if header_index is None:
            # give up and try DictReader on the whole file (original behaviour)
            logger.warning(
                "Could not detect header row in CSV %s; using default DictReader on first line",
                csv_name,
            )
            data_io = io.StringIO("""""".join(raw))
            reader = csv.DictReader(data_io)
        else:
            # Build DictReader from header_index onwards
            header_line = raw[header_index]
            # Create a normalized header list to avoid odd characters
            try:
                header_tokens = next(csv.reader([header_line]))
            except Exception:
                header_tokens = [h for h in re.split(r",", header_line)]

            def _norm_key(k: str) -> str:
                if not k:
                    return ""
                return "".join(ch.lower() for ch in k if ch.isalnum())

            norm_fieldnames = [
                _norm_key(h) or f"col{i}" for i, h in enumerate(header_tokens)
            ]
            # Compose the CSV body starting from header_index+1 for data rows
            body_lines = raw[header_index + 1 :]
            data_io = io.StringIO("""""".join(body_lines))
            reader = csv.DictReader(data_io, fieldnames=norm_fieldnames)

        # Read rows from reader and normalize values
        raw_rows = list(reader)
        logger.info("Parsed %d rows from CSV %s", len(raw_rows), csv_name)
        logger.debug("Sample raw parsed row: %s", raw_rows[0] if raw_rows else None)

        # Normalize header keys for robust mapping (strip non-alnum and lower)
        def _norm_value(v):
            if isinstance(v, str):
                s = v.strip()
                return s or None
            return v

        normalized_rows = []
        for r in raw_rows:
            nr = {}
            for k, v in (r or {}).items():
                nk = "".join(ch.lower() for ch in (k or "") if ch.isalnum())
                if nk not in nr:
                    nr[nk] = _norm_value(v)
            normalized_rows.append(nr)
        rows = normalized_rows
        if rows:
            logger.debug("Sample normalized parsed row: %s", rows[0])
    except Exception as e:
        logger.exception("Failed to parse CSV %s: %s", csv_name, e)
        return jsonify({"error": "Failed to parse CSV"}), 400
    finally:
        try:
            text.close()
        except Exception as e:
            logger.exception("Error closing CSV text wrapper: %s", e)

    inserted = 0
    discarded = 0
    # Insert into DB
    from jobtrack_core import db as jobdb
    from jobtrack_core.request_utils import (  # imported here to avoid circular import at module import time
        parse_applicantid_from_body,
    )

    # If a scoped `applicantid` was provided to the function use it.
    # Otherwise try reading applicantid from JSON body (if client sent JSON) or from form field (multipart)
    if applicantid is None:
        try:
            applicantid = parse_applicantid_from_body()
        except Exception:
            applicantid = None

    # If multipart/form-data upload, the client should include a form field `applicantid`
    if applicantid is None:
        try:
            form_val = request.form.get("applicantid") or request.form.get(
                "applicantId"
            )
            if form_val:
                applicantid = int(form_val)
        except Exception:
            applicantid = None

    if applicantid is None:
        logger.warning("import_leads: missing applicantid")
        return jsonify({"error": "Missing required parameter: applicantid"}), 400

    with jobdb.get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Resolve lead column names using a conservative whitelist.
            # Do NOT perform dynamic discovery via information_schema —
            # that behavior was removed to eliminate a fallback that could
            # be abused for SQL/metadata probing.
            # Resolve lead column names using configured constants (used in other handlers)
            col_connected = CONNECTED_COL
            # Preload existing (name, connected_on) pairs for this applicant so
            # we can efficiently deduplicate incoming rows. Matching is done
            # case-insensitively on name and exactly on the date part of
            # connected_on. Only rows that have a parsed `connected_on` date
            # participate in duplicate detection per requirements.
            existing_pairs = set()
            try:
                cur.execute(
                    f"SELECT name, {col_connected} FROM public.lead WHERE applicantid = %s",
                    (applicantid,),
                )
                for ex in cur.fetchall():
                    try:
                        ex_name = (
                            ex.get("name") if isinstance(ex, dict) else ex[0]
                        ) or ""
                        ex_date = (
                            ex.get(col_connected) if isinstance(ex, dict) else ex[1]
                        )
                    except Exception:
                        # Fallback in case of unexpected row shape
                        ex_name = ""
                        ex_date = None
                    if ex_name and ex_date is not None:
                        # Normalize name to lower/trim and date to ISO yyyy-mm-dd
                        try:
                            norm_name = str(ex_name).strip().lower()
                            if hasattr(ex_date, "isoformat"):
                                norm_date = ex_date.isoformat()
                            else:
                                norm_date = str(ex_date)
                            existing_pairs.add((norm_name, norm_date))
                        except Exception:
                            continue
            except Exception:
                # If preload fails, proceed without deduplication to avoid blocking import
                existing_pairs = set()

            for idx, r in enumerate(rows, start=1):
                # r now contains normalized keys. Use a single `name` column only.
                name_val = r.get("name") or r.get("fullname") or None
                # If name is missing but firstname/lastname are present, combine them.
                if not name_val:
                    first = r.get("firstname") or r.get("first") or r.get("givenname")
                    last = r.get("lastname") or r.get("last") or r.get("surname")
                    if first or last:
                        name_val = " ".join([n for n in [first, last] if n]).strip()
                    else:
                        name_val = None

                linkedin_url = (
                    r.get("profileurl")
                    or r.get("url")
                    or r.get("profile")
                    or r.get("profilelink")
                    or None
                )
                email = r.get("emailaddress") or r.get("email") or None
                company = (
                    r.get("company")
                    or r.get("organisation")
                    or r.get("employer")
                    or None
                )
                position = r.get("position") or r.get("title") or r.get("role") or None
                connected_on_raw = (
                    r.get("connectedon")
                    or r.get("connected")
                    or r.get("dateconnected")
                    or r.get("connectiondate")
                    or None
                )
                connected_on = None
                if connected_on_raw:
                    try:
                        # Try parsing common date formats
                        connected_on = datetime.strptime(
                            connected_on_raw, "%d %b %Y"
                        ).date()
                    except Exception:
                        try:
                            connected_on = datetime.fromisoformat(
                                connected_on_raw
                            ).date()
                        except Exception:
                            # last resort try long month name
                            try:
                                connected_on = datetime.strptime(
                                    connected_on_raw, "%d %B %Y"
                                ).date()
                            except Exception:
                                logger.debug(
                                    'Could not parse connected_on value "%s" for row %d',
                                    connected_on_raw,
                                    idx,
                                )
                                connected_on = None

                logger.debug(
                    "Inserting lead row %d: name=%s email=%s company=%s position=%s connected_on=%s",
                    idx,
                    name_val,
                    email,
                    company,
                    position,
                    connected_on,
                )
                if not name_val:
                    logger.debug(
                        "Row %d has no name value after combining firstname/lastname",
                        idx,
                    )

                # Duplicate detection: only dedupe when both name and connected_on are present
                try:
                    is_duplicate = False
                    if name_val and connected_on is not None:
                        try:
                            norm_name = str(name_val).strip().lower()
                            norm_date = (
                                connected_on.isoformat()
                                if hasattr(connected_on, "isoformat")
                                else str(connected_on)
                            )
                            if (norm_name, norm_date) in existing_pairs:
                                is_duplicate = True
                        except Exception:
                            is_duplicate = False
                    if is_duplicate:
                        logger.info(
                            "Skipping duplicate lead row %d: name=%s connected_on=%s",
                            idx,
                            name_val,
                            connected_on,
                        )
                        discarded += 1
                        continue
                    # Insert using authoritative schema-driven column list
                    cur.execute(
                        f"INSERT INTO public.lead {INSERT_COLUMNS} VALUES ({INSERT_PLACEHOLDERS}) RETURNING leadid;",
                        (
                            name_val,
                            linkedin_url,
                            email,
                            company,
                            position,
                            connected_on,
                            applicantid,
                        ),
                    )
                    inserted_row = cur.fetchone()
                    inserted_id = None
                    if inserted_row:
                        # RealDictCursor -> dict-like
                        inserted_id = (
                            inserted_row.get("leadid")
                            if isinstance(inserted_row, dict)
                            else inserted_row[0]
                        )
                    logger.info("Inserted lead id=%s for row %d", inserted_id, idx)
                    inserted += 1
                    # Add to existing_pairs so subsequent rows in same upload dedupe
                    try:
                        if name_val and connected_on is not None:
                            existing_pairs.add(
                                (
                                    str(name_val).strip().lower(),
                                    (
                                        connected_on.isoformat()
                                        if hasattr(connected_on, "isoformat")
                                        else str(connected_on)
                                    ),
                                )
                            )
                    except Exception as e:
                        logger.debug("Failed to add to existing_pairs: %s", e)
                except Exception as e:
                    logger.exception("Failed to insert row %d: %s", idx, e)
                    # continue with next row rather than aborting entire import
                    continue

    # Compute last_refreshed (max connected_on) for this applicant
    last_refreshed = None
    try:
        with jobdb.get_conn() as conn2:
            with conn2.cursor() as cur2:
                cur2.execute(
                    f"SELECT MAX({col_connected}) FROM public.lead WHERE applicantid = %s",
                    (applicantid,),
                )
                row = cur2.fetchone()
                if row:
                    last_val = (
                        row[0]
                        if isinstance(row, (list, tuple))
                        else row.get("max") if isinstance(row, dict) else row[0]
                    )
                    if last_val is not None:
                        try:
                            # last_val may be a date object
                            if hasattr(last_val, "isoformat"):
                                last_refreshed = last_val.isoformat()
                            else:
                                last_refreshed = str(last_val)
                        except Exception:
                            last_refreshed = str(last_val)
    except Exception:
        last_refreshed = None

    return (
        jsonify(
            {
                "ok": True,
                "imported": inserted,
                "discarded": discarded,
                "last_refreshed": last_refreshed,
            }
        ),
        200,
    )


# Register scoped import route on the blueprint
@leads_bp.route("/api/<int:applicantid>/leads/import", methods=["POST", "OPTIONS"])
def import_leads_scoped(applicantid: int):
    """Scoped wrapper for leads import that delegates to import_leads()."""
    return import_leads(applicantid)


@leads_bp.route("/api/<int:applicantid>/leads", methods=["GET"])
def list_leads(applicantid: int) -> Any:
    """List leads with optional filters: reviewoutcomeid, q (search), order_by, limit, offset"""
    reviewoutcomeid = request.args.get("reviewoutcomeid")
    q = request.args.get("q")
    order_by = request.args.get("order_by") or "created_at"
    dir_param = (request.args.get("dir") or "desc").lower()
    limit = request.args.get("limit")
    offset = request.args.get("offset")

    # applicantid provided via path parameter and validated by Flask routing
    try:
        applicantid = int(applicantid)
    except Exception:
        return (
            jsonify({"error": "Missing or invalid required parameter: applicantid"}),
            400,
        )

    # Enforce session/applicant guard
    from jobtrack_core.request_utils import require_applicant_allowed

    guard = require_applicant_allowed(applicantid)
    if guard:
        return guard

    # Resolve lead column variants before building SQL so we can alias back to expected JSON keys
    from jobtrack_core import db as jobdb

    # Resolve columns from the parsed schema (no DB queries required)
    col_linkedin = LINKEDIN_COL
    col_connected = CONNECTED_COL

    sql = f"SELECT leadid, name, {col_linkedin} AS linkedin_url, email, company, position, {col_connected} AS connected_on, reviewdate, reviewoutcomeid, created_at FROM public.lead"
    from typing import Any as _Any

    clauses: list[str] = []
    params: list[_Any] = []
    # Support a special value of '0' to mean "unset" (reviewoutcomeid IS NULL).
    # Use explicit None check because '0' is a falsy string.
    if reviewoutcomeid is not None:
        if str(reviewoutcomeid) == "0":
            clauses.append("reviewoutcomeid IS NULL")
        else:
            try:
                rid = int(reviewoutcomeid)
                clauses.append("reviewoutcomeid = %s")
                params.append(rid)
            except Exception:
                # invalid value, ignore the filter
                pass
    if q:
        clauses.append("(name ILIKE %s OR email ILIKE %s OR company ILIKE %s)")
        like = f"%{q}%"
        params.extend([like, like, like])

    # Always scope to the requesting applicant
    # Append applicantid condition to clause list so all queries (including count) honour tenant scoping
    clauses.append("applicantid = %s")
    params.append(applicantid)

    # Defer building the WHERE clause until after all clause modifications (e.g. exclude_promoted)

    # Optionally exclude leads marked as 'Promoted To Contact'
    exclude_promoted = request.args.get("exclude_promoted")
    if exclude_promoted and str(exclude_promoted).lower() in ("1", "true", "yes"):
        # find the refid for Promoted To Contact in ReferenceData; if found add exclusion
        with jobdb.get_conn() as conn:
            with conn.cursor() as cur:
                try:
                    cur.execute(
                        "SELECT refid FROM ReferenceData WHERE lower(refdataclass) = 'lead_review_status' AND lower(refvalue) = 'promoted to contact' LIMIT 1;"
                    )
                    row = cur.fetchone()
                    if row:
                        promoted_refid = row[0]
                        # Insert exclusion into clauses so it participates with applicantid clause
                        clauses.insert(
                            0, "(reviewoutcomeid IS NULL OR reviewoutcomeid <> %s)"
                        )
                        # promoted_refid goes before applicantid in params (we inserted clause at front)
                        params.insert(0, int(promoted_refid))
                except Exception:
                    # if lookup fails, ignore and continue without exclusion
                    pass
    # Optionally exclude leads explicitly marked as 'Not Relevant at this Time' (no action)
    exclude_no_action = request.args.get("exclude_no_action")
    if exclude_no_action and str(exclude_no_action).lower() in ("1", "true", "yes"):
        with jobdb.get_conn() as conn:
            with conn.cursor() as cur:
                try:
                    cur.execute(
                        "SELECT refid FROM public.referencedata WHERE lower(refdataclass) = 'lead_review_status' AND lower(refvalue) = 'not relevant at this time' LIMIT 1;"
                    )
                    row = cur.fetchone()
                    if row:
                        no_action_refid = row[0]
                        # Exclude rows where reviewoutcomeid == no_action_refid (keep NULL or other values)
                        clauses.insert(
                            0, "(reviewoutcomeid IS NULL OR reviewoutcomeid <> %s)"
                        )
                        params.insert(0, int(no_action_refid))
                except Exception:
                    # ignore lookup failures
                    pass
    # Optionally exclude any leads that have a review outcome set (i.e. hide reviewed)
    exclude_reviewed = request.args.get("exclude_reviewed")
    if exclude_reviewed and str(exclude_reviewed).lower() in ("1", "true", "yes"):
        # Add clause to require reviewoutcomeid IS NULL (i.e. only unset)
        # Insert near the front so it composes properly with other clauses
        clauses.insert(0, "reviewoutcomeid IS NULL")
    # basic ordering whitelist (allow review-related sorts too)
    allowed_order = (
        "created_at",
        "connected_on",
        "name",
        "company",
        "position",
        "reviewoutcomeid",
        "reviewdate",
    )
    if order_by not in allowed_order:
        order_by = "created_at"
    dir_sql = "DESC"
    if dir_param in ("asc", "desc"):
        dir_sql = dir_param.upper()
    # Build count params before adding pagination so count isn't affected by LIMIT/OFFSET
    base_params: list[_Any] = list(params)

    # Log clauses/params before building WHERE to aid debugging of placeholder mismatches
    logger.debug("leads: clauses before WHERE build: %s", clauses)
    logger.debug("leads: params before WHERE build: %s", params)

    # Build WHERE clause once (after any clause insertions like exclude_promoted)
    where_sql = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    # Attach WHERE to the main query
    sql += where_sql

    # Support special ordering expressions: for review outcome sort we order
    # by the referencedata.refvalue (human label) so sorting by label is
    # consistent with UI expectations. For other allowed columns use the
    # direct column name which was validated above.
    if order_by == "reviewoutcomeid":
        # Order by the human-friendly refvalue for the review outcome (fallback to empty string)
        order_expr = "(SELECT COALESCE(refvalue, '') FROM public.referencedata rd WHERE rd.refid = reviewoutcomeid)"
    else:
        order_expr = order_by
    sql += f" ORDER BY {order_expr} {dir_sql}"
    # Prepare final query params separately so we can compute count using base_params
    query_params: list[_Any] = list(base_params)
    if limit:
        sql += " LIMIT %s"
        query_params.append(int(limit))
        if offset:
            sql += " OFFSET %s"
            query_params.append(int(offset))

    from jobtrack_core import db as jobdb

    with jobdb.get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            total_count = None
            # If a limit is provided, compute total via COUNT(*) to help pagination
            if limit:
                count_sql = "SELECT COUNT(*) FROM public.lead" + where_sql
                try:
                    cur.execute(count_sql, tuple(base_params) if base_params else None)
                    cnt = cur.fetchone()
                    if cnt:
                        # cnt can be a dict-like from RealDictCursor
                        if isinstance(cnt, dict):
                            total_count = list(cnt.values())[0]
                        else:
                            total_count = cnt[0]
                except Exception:
                    total_count = None

            # Log the final SQL and params for debugging param-mismatch issues
            try:
                logger.debug("Executing leads SQL: %s", sql)
                logger.debug("With params: %s", query_params)
                # Defensive check: ensure number of supplied params matches SQL placeholders
                placeholder_count = sql.count("%s")
                if placeholder_count != len(query_params):
                    logger.warning(
                        "leads: placeholder count (%s) != provided params length (%s); trimming or padding as needed",
                        placeholder_count,
                        len(query_params),
                    )
                exec_params = None
                if query_params:
                    # If too many params, trim; if too few, pass as-is (psycopg2 will raise and be logged)
                    if len(query_params) > placeholder_count:
                        exec_params = tuple(query_params[:placeholder_count])
                    else:
                        exec_params = tuple(query_params)
                cur.execute(sql, exec_params)
                rows = cur.fetchall()
            except TypeError as te:
                # Likely a parameter/placeholder mismatch — log details and return 500
                # include clauses/base_params for deeper context
                logger.exception(
                    "Parameter mismatch executing leads SQL: %s; params=%s; clauses=%s; base_params=%s; error=%s",
                    sql,
                    query_params,
                    clauses,
                    base_params,
                    te,
                )
                return jsonify({"error": "Server error executing query"}), 500
            except Exception:
                logger.exception("Unexpected error executing leads SQL")
                return jsonify({"error": "Server error executing query"}), 500

    # format connected_on as YYYY-MM-DD
    for r in rows:
        if r.get("connected_on"):
            try:
                r["connected_on"] = r["connected_on"].strftime("%Y-%m-%d")
            except Exception:
                r["connected_on"] = str(r["connected_on"])

    # Return rows; if we computed total_count include it in a response header
    resp = make_response(jsonify(rows), 200)
    if total_count is not None:
        resp.headers["X-Total-Count"] = str(total_count)
    return resp


# NOTE: Unscoped lead update endpoint removed. Use the scoped
# `/api/<applicantid>/leads/<leadid>` route which enforces applicant scoping.
def update_lead(leadid):
    data = request.get_json() or {}
    reviewoutcomeid = data.get("reviewoutcomeid")

    from jobtrack_core import db as jobdb
    from jobtrack_core.request_utils import parse_applicantid_from_body

    applicantid = parse_applicantid_from_body()
    if applicantid is None:
        return jsonify({"error": "Missing required parameter: applicantid"}), 400

    with jobdb.get_conn() as conn:
        with conn.cursor() as cur:
            if reviewoutcomeid is not None:
                # set reviewdate when outcome set (ensure applicant scoping)
                cur.execute(
                    "UPDATE public.lead SET reviewoutcomeid = %s, reviewdate = now(), updated_at = now() WHERE leadid = %s AND applicantid = %s RETURNING leadid;",
                    (int(reviewoutcomeid), leadid, applicantid),
                )
            else:
                cur.execute(
                    "UPDATE public.lead SET reviewoutcomeid = NULL, reviewdate = NULL, updated_at = now() WHERE leadid = %s AND applicantid = %s RETURNING leadid;",
                    (leadid, applicantid),
                )
            res = cur.fetchone()
            if not res:
                return jsonify({"error": "Not found"}), 404

    return jsonify({"ok": True}), 200


# NOTE: Unscoped lead delete endpoint removed. Use the scoped
# `/api/<applicantid>/leads/<leadid>` route which enforces applicant scoping.
def delete_lead(leadid):
    # NOTE: physical deletion of leads is disabled. Instead mark the lead as
    # 'Not Relevant at this Time' via the lead_review_status reference data.
    from jobtrack_core import db as jobdb
    from jobtrack_core.request_utils import parse_applicantid_from_body

    applicantid = parse_applicantid_from_body()
    if applicantid is None:
        return jsonify({"error": "Missing required parameter: applicantid"}), 400

    with jobdb.get_conn() as conn:
        with conn.cursor() as cur:
            # Attempt to find the refid for 'Not Relevant at this Time' in ReferenceData
            try:
                cur.execute(
                    "SELECT refid FROM public.referencedata WHERE lower(refdataclass) = 'lead_review_status' AND lower(refvalue) = 'not relevant at this time' LIMIT 1;"
                )
                row = cur.fetchone()
                refid = None
                if row:
                    # row may be a tuple or single value depending on cursor
                    refid = row[0] if not isinstance(row, dict) else row.get("refid")
            except Exception:
                refid = None

            if refid is not None:
                # mark as Not Relevant and set reviewdate/updated_at for traceability
                cur.execute(
                    "UPDATE public.lead SET reviewoutcomeid = %s, reviewdate = now(), updated_at = now() WHERE leadid = %s AND applicantid = %s RETURNING leadid;",
                    (int(refid), leadid, applicantid),
                )
            else:
                # Fallback: set reviewdate and updated_at but leave reviewoutcomeid unchanged
                cur.execute(
                    "UPDATE public.lead SET reviewdate = now(), updated_at = now() WHERE leadid = %s AND applicantid = %s RETURNING leadid;",
                    (leadid, applicantid),
                )

            res = cur.fetchone()
            if not res:
                return jsonify({"error": "Not found"}), 404

    return jsonify({"ok": True}), 200


@leads_bp.route(
    "/api/<int:applicantid>/leads/<int:leadid>/set_reviewoutcome", methods=["POST"]
)
def set_lead_review_outcome(applicantid, leadid):
    """Set the lead's review outcome by strict ReferenceData lookup.

    Body may contain either `refid` (number) or `refvalue` (string). The
    reference lookup is strict within `refdataclass = 'lead_review_status'` and
    the operation will fail if the referenced row cannot be found (no fallback).
    """
    try:
        applicantid = int(applicantid)
    except Exception:
        return (
            jsonify({"error": "Missing or invalid required parameter: applicantid"}),
            400,
        )

    data = request.get_json() or {}
    refid = data.get("refid")
    refvalue = data.get("refvalue")

    if refid is None and (not refvalue):
        return jsonify({"error": "Either refid or refvalue is required"}), 400

    from jobtrack_core import db as jobdb
    from jobtrack_core.request_utils import require_applicant_allowed

    guard = require_applicant_allowed(applicantid)
    if guard:
        return guard

    with jobdb.get_conn() as conn:
        with conn.cursor() as cur:
            # Resolve refid strictly within lead_review_status
            looked_up_refid = None
            try:
                if refid is not None:
                    cur.execute(
                        "SELECT refid FROM public.referencedata WHERE refid = %s AND lower(refdataclass) = 'lead_review_status' LIMIT 1;",
                        (int(refid),),
                    )
                    row = cur.fetchone()
                    if not row:
                        return (
                            jsonify(
                                {"error": "Reference data not found for provided refid"}
                            ),
                            400,
                        )
                    looked_up_refid = (
                        row[0] if not isinstance(row, dict) else row.get("refid")
                    )
                else:
                    cur.execute(
                        "SELECT refid FROM public.referencedata WHERE lower(refdataclass) = 'lead_review_status' AND lower(refvalue) = lower(%s) LIMIT 1;",
                        (str(refvalue),),
                    )
                    row = cur.fetchone()
                    if not row:
                        return (
                            jsonify(
                                {
                                    "error": "Reference data not found for provided refvalue"
                                }
                            ),
                            400,
                        )
                    looked_up_refid = (
                        row[0] if not isinstance(row, dict) else row.get("refid")
                    )
            except Exception:
                return jsonify({"error": "Failed to lookup reference data"}), 500

            if looked_up_refid is None:
                return jsonify({"error": "Reference data lookup failed"}), 400

            # Perform the update scoped to applicantid and leadid
            try:
                cur.execute(
                    "UPDATE public.lead SET reviewoutcomeid = %s, reviewdate = now(), updated_at = now() WHERE leadid = %s AND applicantid = %s RETURNING leadid;",
                    (int(looked_up_refid), leadid, applicantid),
                )
                res = cur.fetchone()
                if not res:
                    return jsonify({"error": "Not found"}), 404
            except Exception as e:
                logger.exception(
                    "Failed to set review outcome for lead %s: %s", leadid, e
                )
                return jsonify({"error": "Failed to set review outcome"}), 500

    return jsonify({"ok": True}), 200


@leads_bp.route("/api/<int:applicantid>/leads/<int:leadid>/prefill", methods=["GET"])
def prefill_contact(applicantid, leadid):
    """Return prefill data for QuickEditor and a duplicate-name check."""
    try:
        applicantid = int(applicantid)
    except Exception:
        return (
            jsonify({"error": "Missing or invalid required parameter: applicantid"}),
            400,
        )

    from jobtrack_core import db as jobdb

    with jobdb.get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Resolve lead column names and select aliases so JSON keys remain stable
            col_linkedin = LINKEDIN_COL
            col_connected = CONNECTED_COL
            # Note: some lead table variants do not include separate firstname/lastname columns.
            # Select only columns we know to exist (name + resolved aliases) to avoid UndefinedColumn errors.
            cur.execute(
                f"SELECT leadid, name, {col_linkedin} AS linkedin_url, email, company, position, {col_connected} AS connected_on FROM public.lead WHERE leadid = %s AND applicantid = %s LIMIT 1;",
                (leadid, applicantid),
            )
            lead = cur.fetchone()
            if not lead:
                return jsonify({"error": "Not found"}), 404

            # Construct a suggested contact name. Prefer the normalized `name` column from leads,
            # but fall back to firstname+lastname if those are present.
            suggested_name = (lead.get("name") or "").strip()
            if not suggested_name:
                suggested_name = " ".join(
                    [
                        name
                        for name in [
                            lead.get("firstname") or "",
                            lead.get("lastname") or "",
                        ]
                        if name
                    ]
                ).strip()

            # Check for duplicate names (case-insensitive exact match). The
            # `contact` table does not include an `email` column in the current
            # schema, so only query `contactid` and `name` to avoid SQL errors.
            duplicates = []
            if suggested_name:
                cur.execute(
                    "SELECT contactid, name FROM public.contact WHERE lower(name) = lower(%s) AND applicantid = %s LIMIT 10;",
                    (suggested_name, applicantid),
                )
                duplicates = cur.fetchall()

            prefill = {
                "name": suggested_name,
                "current_organization": lead.get("company"),
                "currentrole": lead.get("position"),
                "email": lead.get("email"),
                "linkedin_url": lead.get("linkedin_url"),
                "duplicates": duplicates,
            }

    return jsonify(prefill), 200


@leads_bp.route("/api/<int:applicantid>/leads/summary", methods=["GET"])
def leads_summary(applicantid):
    """Return aggregated counts for leads grouped by review outcome (and totals).
    Response shape: { total: N, by_refvalue: { 'Review Value': count, ... }, by_refid: { refid: count, ... } }
    """
    try:
        applicantid = int(applicantid)
    except ValueError:
        return (
            jsonify({"error": "Missing or invalid required parameter: applicantid"}),
            400,
        )

    from jobtrack_core import db as jobdb

    summary = {"total": 0, "by_refvalue": {}, "by_refid": {}}
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT COALESCE(l.reviewoutcomeid, 0) AS reviewoutcomeid, rd.refvalue, COUNT(*) AS cnt
                    FROM public.lead l
                    LEFT JOIN referencedata rd ON l.reviewoutcomeid = rd.refid
                    WHERE l.applicantid = %s
                    GROUP BY COALESCE(l.reviewoutcomeid, 0), rd.refvalue
                    """,
                    (applicantid,),
                )
                rows = cur.fetchall()

                # Also compute the most recent connected_on for this applicant
                try:
                    # Use authoritative column name for connected date
                    col_connected = CONNECTED_COL
                    cur.execute(
                        f"SELECT MAX({col_connected}) AS max_connected FROM public.lead WHERE applicantid = %s",
                        (applicantid,),
                    )
                    max_row = cur.fetchone()
                    max_connected = None
                    if max_row:
                        # RealDictCursor returns dict-like
                        if isinstance(max_row, dict):
                            max_connected = max_row.get("max_connected")
                        else:
                            max_connected = max_row[0]
                    if max_connected is not None:
                        try:
                            if hasattr(max_connected, "isoformat"):
                                summary["last_refreshed"] = max_connected.isoformat()
                            else:
                                summary["last_refreshed"] = str(max_connected)
                        except Exception:
                            summary["last_refreshed"] = str(max_connected)
                    else:
                        summary["last_refreshed"] = None
                except Exception:
                    summary["last_refreshed"] = None
        total = 0
        by_refvalue = {}
        by_refid = {}
        for r in rows:
            cnt = int(r.get("cnt") or 0)
            total += cnt
            refid = r.get("reviewoutcomeid") or 0
            refvalue = r.get("refvalue") or (str(refid) if refid else "none")
            by_refvalue[str(refvalue)] = cnt
            by_refid[str(refid)] = cnt

        summary["total"] = total
        summary["by_refvalue"] = by_refvalue
        summary["by_refid"] = by_refid
        return jsonify(summary), 200
    except Exception as e:
        logger.exception("Failed to compute leads summary: %s", e)
        return jsonify({"error": "Failed to compute summary"}), 500


# Top companies by number of leads
@leads_bp.route("/api/<int:applicantid>/leads/top_companies", methods=["GET"])
def leads_top_companies(applicantid):
    limit = request.args.get("limit") or 10
    try:
        limit = int(limit)
    except ValueError:
        limit = 10

    try:
        applicantid = int(applicantid)
    except ValueError:
        return (
            jsonify({"error": "Missing or invalid required parameter: applicantid"}),
            400,
        )

    from jobtrack_core import db as jobdb

    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT company, COUNT(*) AS cnt
                    FROM public.lead
                    WHERE company IS NOT NULL AND trim(company) <> '' AND applicantid = %s
                    GROUP BY company
                    ORDER BY cnt DESC
                    LIMIT %s
                    """,
                    (applicantid, limit),
                )
                rows = cur.fetchall()
        return jsonify(rows), 200
    except Exception as e:
        logger.exception("Failed to compute top companies: %s", e)
        return jsonify({"error": "Failed to compute top companies"}), 500


# Reviews (reviewdate) counts by date
@leads_bp.route("/api/<int:applicantid>/leads/reviews_by_date", methods=["GET"])
def leads_reviews_by_date(applicantid):
    from_date = request.args.get("from_date")
    to_date = request.args.get("to_date")
    try:
        applicantid = int(applicantid)
    except ValueError:
        return (
            jsonify({"error": "Missing or invalid required parameter: applicantid"}),
            400,
        )

    sql = "SELECT reviewdate::date AS date, COUNT(*) AS cnt FROM public.lead WHERE reviewdate IS NOT NULL AND applicantid = %s"
    from typing import Any as _Any

    params: list[_Any] = [applicantid]
    if from_date:
        sql += " AND reviewdate::date >= %s"
        params.append(from_date)
    if to_date:
        sql += " AND reviewdate::date <= %s"
        params.append(to_date)
    sql += " GROUP BY reviewdate::date ORDER BY reviewdate::date ASC"

    from jobtrack_core import db as jobdb

    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, tuple(params) if params else None)
                rows = cur.fetchall()
        return jsonify(rows), 200
    except Exception as e:
        logger.exception("Failed to compute reviews by date: %s", e)
        return jsonify({"error": "Failed to compute reviews by date"}), 500


# NOTE: Unscoped lead promote endpoint removed. Use the scoped
# `/api/<applicantid>/leads/<leadid>/promote` route which enforces
# applicant scoping and authorization.
def promote_lead(leadid):
    """Create a Contact from a lead. Simple promotion that inserts into Contact if no exact duplicate by name/email."""
    data = request.get_json() or {}
    # Allow override of fields from client (quick editor)
    name = data.get("name")
    currentrole = data.get("currentrole")
    current_organization = data.get("current_organization")
    email = data.get("email")

    from jobtrack_core import db as jobdb
    from jobtrack_core.request_utils import parse_applicantid_from_body

    applicantid = parse_applicantid_from_body()
    if applicantid is None:
        return jsonify({"error": "Missing required parameter: applicantid"}), 400

    with jobdb.get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM public.lead WHERE leadid = %s AND applicantid = %s LIMIT 1;",
                (leadid, applicantid),
            )
            lead = cur.fetchone()
            if not lead:
                return jsonify({"error": "Not found"}), 404

            # prefer provided fields, else lead values
            name = (
                name
                or " ".join(
                    [
                        n
                        for n in [
                            lead.get("firstname") or "",
                            lead.get("lastname") or "",
                        ]
                        if n
                    ]
                ).strip()
            )
            currentrole = currentrole or lead.get("position")
            current_organization = current_organization or lead.get("company")
            email = email or lead.get("email")

            # Basic duplicate check by exact name only. The `contact` table in
            # this schema does not contain an `email` column, so skip email
            # duplicate checks to avoid triggering UndefinedColumn errors.
            if name:
                cur.execute(
                    "SELECT contactid FROM public.contact WHERE lower(name) = lower(%s) AND applicantid = %s LIMIT 1;",
                    (name, applicantid),
                )
                if cur.fetchone():
                    return jsonify({"error": "Contact with same name exists"}), 409

            # Resolve or create organisation
            companyorgid = None
            if current_organization and str(current_organization).strip():
                cur.execute(
                    "SELECT orgid FROM public.organisation WHERE lower(name) = lower(%s) LIMIT 1;",
                    (current_organization,),
                )
                orow = cur.fetchone()
                if orow:
                    companyorgid = (
                        orow.get("orgid") if isinstance(orow, dict) else orow[0]
                    )
                else:
                    cur.execute(
                        "INSERT INTO public.organisation (name) VALUES (%s) RETURNING orgid;",
                        (current_organization,),
                    )
                    companyorgid = cur.fetchone().get("orgid")

            # Insert contact (attach applicantid) and record originating leadid for traceability
            cur.execute(
                "INSERT INTO public.contact (name, currentrole, currentorgid, applicantid, leadid) VALUES (%s, %s, %s, %s, %s) RETURNING contactid;",
                (name, currentrole, companyorgid, applicantid, leadid),
            )
            new_contact = cur.fetchone()

    return jsonify({"ok": True, "contact": new_contact}), 201
