from flask import Blueprint, request, jsonify, current_app
import os
import base64
from psycopg2.extras import RealDictCursor
from typing import Any

import jobtrack_core.db as jobdb

engagements_bp = Blueprint("engagements", __name__)


@engagements_bp.route("/api/<int:applicantid>/engagements", methods=["GET"])
def get_engagements(applicantid):
    """
    Retrieves engagement logs with associated contact names.
    Optional parameters:
    - contact_id: filter by specific contact
    - engagement_type_id: filter by engagement type (engagementtype_refid)
    - limit: maximum number of records (default: all)
    """
    try:
        contact_id = request.args.get("contact_id")
        engagement_type_id = request.args.get("engagement_type_id")
        limit = request.args.get("limit")
        try:
            applicantid = int(applicantid)
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
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
        # Determine contact group refid up-front so we can include group-member
        # matches when filtering by a specific contact id.
        group_refid = None
        try:
            with jobdb.get_conn() as _tmpconn:
                with _tmpconn.cursor(cursor_factory=RealDictCursor) as _tmpcur:
                    _tmpcur.execute(
                        "SELECT refid FROM referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower(%s) LIMIT 1;",
                        ("Contact Group",),
                    )
                    _g = _tmpcur.fetchone()
                    group_refid = _g["refid"] if _g else None
        except Exception:
            group_refid = None

        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                join_text = (
                    " LEFT JOIN referencedata rd ON rd.refid = e.engagementtypeid "
                )
                type_field = " , rd.refvalue AS engagement_type, rd.refvalue AS kind "
                # Also include contacttype and possible contactgroup name; we'll resolve group members below
                extra_fields = (
                    ", e.contacttypeid AS contacttypeid, cg.name AS contactgroup_name "
                )
                where_clauses = ["c.applicantid = %s"]
                params: list[Any] = [applicantid]
                if contact_id:
                    try:
                        cid = int(contact_id)
                    except Exception:
                        cid = None
                    if cid is not None and group_refid:
                        # Match engagements that reference the contact directly OR
                        # engagements that are of contact-group type where the
                        # contact is a member of the group.
                        where_clauses.append(
                            "(e.contactid = %s OR (e.contacttypeid = %s AND EXISTS (SELECT 1 FROM contactgroupmembers m WHERE m.contactgroupid = e.contactid AND m.contactid = %s AND m.applicantid = %s)))"
                        )
                        params.extend([cid, group_refid, cid, applicantid])
                    else:
                        # Fallback: only match engagements whose contactid equals the provided id
                        where_clauses.append("e.contactid = %s")
                        params.append(cid if cid is not None else contact_id)
                if engagement_type_id:
                    where_clauses.append("e.engagementtypeid = %s")
                    params.append(int(engagement_type_id))
                where_text = (
                    " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
                )
                logentry_select = "e.logentry AS logentry, NULL::text AS notes, "
                sql = (
                    "SELECT e.engagementlogid AS engagementlogid, e.engagementlogid AS logid, e.contactid, e.logdate AS logdate, e.logdate AS engagedate, "
                    + logentry_select
                    + "e.engagementtypeid AS engagementtypeid, c.name AS contact_name, c.currentorgid AS companyorgid, co.name AS company_name"
                    + type_field
                    + extra_fields
                    + " FROM EngagementLog e"
                    + " LEFT JOIN Contact c ON e.contactid = c.contactid"
                    + " LEFT JOIN contactgroup cg ON e.contactid = cg.contactgroupid"
                    + " LEFT JOIN Organisation co ON c.currentorgid = co.orgid"
                    + join_text
                    + where_text
                    + " ORDER BY e.logdate DESC, e.engagementlogid DESC"
                )
                if limit:
                    sql += " LIMIT %s"
                    params.append(int(limit))
                sql += ";"
                cursor.execute(sql, params if params else None)
                engagements = cursor.fetchall()
                if pg_key_env and engagements:
                    dec_cursor = conn.cursor()
                    for engagement in engagements:
                        stored = engagement.get("logentry")
                        if not stored:
                            continue
                        try:
                            base64.b64decode(stored, validate=True)
                        except Exception:
                            continue
                        try:
                            dec_cursor.execute(
                                "SELECT pgp_sym_decrypt(decode(%s, 'base64')::bytea, %s)::text",
                                (stored, pg_key_env),
                            )
                            dec_row = dec_cursor.fetchone()
                            if dec_row and dec_row[0] is not None:
                                engagement["logentry"] = dec_row[0]
                                engagement["notes"] = dec_row[0]
                        except Exception:
                            # don't fail the whole list on a single decryption error
                            continue
        # Build contacts array for each engagement. Treat rows referencing a
        # contactgroup as a group if either the contacttypeid indicates the
        # Contact Group refid or the LEFT JOIN produced a contactgroup_name.
        for engagement in engagements:
            if engagement.get("engagedate"):
                try:
                    engagement["engagedate"] = engagement["engagedate"].strftime(
                        "%Y-%m-%d"
                    )
                except Exception:
                    engagement["engagedate"] = str(engagement["engagedate"])
            elif engagement.get("logdate"):
                try:
                    engagement["engagedate"] = engagement["logdate"].strftime(
                        "%Y-%m-%d"
                    )
                except Exception:
                    engagement["engagedate"] = str(engagement["logdate"])
            if (
                engagement.get("notes") is None
                and engagement.get("logentry") is not None
            ):
                engagement["notes"] = engagement.get("logentry")
            if (
                engagement.get("kind") is None
                and engagement.get("engagement_type") is not None
            ):
                engagement["kind"] = engagement.get("engagement_type")
            # Build `contacts` array: for individual contact types, return single-member list;
            # for contact group types, query membership and attach `contacts` and `contactgroupname`.
            try:
                # Determine whether this row represents a contact group.
                # Prefer the explicit `contacttypeid` marker (group_refid). Only
                # treat the row as a group via the LEFT JOIN `contactgroup_name`
                # when there was no individual Contact matched (i.e. no
                # `contact_name`). This avoids misclassifying engagements when
                # contact and contactgroup ids overlap.
                is_group = False
                try:
                    # Treat as group when the contacttype explicitly marks it as
                    # a Contact Group. This is authoritative even if a Contact
                    # record exists with the same id. Fall back to the LEFT JOIN
                    # produced `contactgroup_name` only when contacttypeid is
                    # not present and no individual Contact matched.
                    if (
                        engagement.get("contacttypeid")
                        and group_refid
                        and int(engagement.get("contacttypeid")) == int(group_refid)
                    ):
                        is_group = True
                except Exception:
                    is_group = False
                # Only treat as group by join if there is no individual contact
                # record present for this engagement (protects against id overlaps).
                if (
                    not is_group
                    and engagement.get("contactgroup_name")
                    and not engagement.get("contact_name")
                ):
                    is_group = True

                if is_group:
                    gid = engagement.get("contactid")
                    if gid:
                        with jobdb.get_conn() as _gconn:
                            with _gconn.cursor(cursor_factory=RealDictCursor) as _gcur:
                                _gcur.execute(
                                    "SELECT c.contactid, c.name, c.currentorgid AS companyorgid, o.name AS company_name FROM contactgroupmembers m JOIN contact c ON c.contactid = m.contactid LEFT JOIN organisation o ON c.currentorgid = o.orgid WHERE m.contactgroupid = %s AND m.applicantid = %s ORDER BY c.name;",
                                    (gid, applicantid),
                                )
                                members = _gcur.fetchall() or []
                        engagement["contacts"] = [
                            {
                                "contactid": m.get("contactid"),
                                "name": m.get("name"),
                                "companyorgid": m.get("companyorgid"),
                                "company_name": m.get("company_name"),
                            }
                            for m in members
                        ]
                        # Build a comma-delimited preview of group member names (cap at 50 chars)
                        try:
                            member_names = [str(m.get("name") or "") for m in members]
                            preview = ", ".join([n for n in member_names if n])
                            if preview and len(preview) > 50:
                                preview = preview[:47].rstrip() + "..."
                        except Exception:
                            preview = None
                        # prefer explicit contactgroup_name only if we couldn't build a preview
                        engagement["contactgroupname"] = (
                            preview or engagement.get("contactgroup_name") or None
                        )
                    else:
                        engagement["contacts"] = []
                        engagement["contactgroupname"] = None
                else:
                    # Individual contact: map to contacts list with single entry if contact present
                    cid = engagement.get("contactid")
                    if cid:
                        engagement["contacts"] = [
                            {
                                "contactid": cid,
                                "name": engagement.get("contact_name"),
                                "companyorgid": engagement.get("companyorgid"),
                                "company_name": engagement.get("company_name"),
                            }
                        ]
                    else:
                        engagement["contacts"] = []
                        # ensure contactgroupname absent for non-groups
                        engagement.pop("contactgroupname", None)
            except Exception:
                # On error building contacts list, fall back to minimal shape
                engagement.setdefault("contacts", [])
        # Deduplicate engagements by engagement id to avoid returning the
        # same logical engagement multiple times (defensive: protects against
        # upstream joins or data issues that may generate duplicates).
        try:
            seen = set()
            unique_engs = []
            for e in engagements:
                eid = (
                    e.get("engagementlogid") or e.get("engagementid") or e.get("logid")
                )
                if eid is None:
                    # fallback: include items without id
                    unique_engs.append(e)
                    continue
                if eid in seen:
                    continue
                seen.add(eid)
                unique_engs.append(e)
            engagements = unique_engs
        except Exception:
            # If dedupe fails for any reason, fall back to original list
            pass

        return jsonify(engagements)
    except Exception as e:
        # Log and return a generic error for unexpected failures
        current_app.logger.exception("Unexpected error retrieving engagements: %s", e)
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@engagements_bp.route("/api/<int:applicantid>/engagements/count", methods=["GET"])
def get_engagements_count(applicantid):
    """Return a simple count of engagement records for the applicant."""
    try:
        applicantid = int(applicantid)
    except Exception:
        return (jsonify({"error": "Invalid applicantid"}), 400)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT COUNT(*) FROM engagementlog WHERE applicantid = %s",
                    (applicantid,),
                )
                row = cursor.fetchone()
                count = int(row[0]) if row and row[0] is not None else 0
        return jsonify(count)
    except Exception:
        current_app.logger.exception(
            "Error fetching engagements count for applicant %s", applicantid
        )
        return (jsonify({"error": "Database error retrieving engagement count."}), 500)


@engagements_bp.route("/api/<int:applicantid>/engagements", methods=["POST"])
def create_engagement_scoped_bp(applicantid):
    """Proxy POST create endpoint for engagements — delegates to app's helper."""
    data = request.get_json() or {}
    try:
        try:
            applicantid = int(applicantid)
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        # Lazy import to avoid circular import at module load time
        from app import require_applicant_allowed, _engagement_create_impl

        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        return _engagement_create_impl(applicantid, data)
    except Exception as e:
        current_app.logger.exception("create_engagement_scoped_bp error: %s", e)
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@engagements_bp.route(
    "/api/<int:applicantid>/engagements/<int:engagement_id>", methods=["PUT"]
)
def update_engagement_scoped_bp(applicantid, engagement_id):
    """Proxy PUT update endpoint for engagements — delegates to app's helper."""
    data = request.get_json() or {}
    try:
        try:
            applicantid = int(applicantid)
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        try:
            current_app.logger.debug(
                "update_engagement_scoped_bp called",
                extra={
                    "applicantid": applicantid,
                    "engagement_id": engagement_id,
                    "headers": {
                        k: v
                        for k, v in request.headers.items()
                        if k.lower() not in ("cookie", "authorization")
                    },
                    "body": data,
                },
            )
        except Exception:
            current_app.logger.debug(
                "update_engagement_scoped_bp: failed to log request context"
            )
        # Lazy import helpers to avoid circular import
        from app import require_applicant_allowed, _engagement_update_impl

        guard = require_applicant_allowed(applicantid)
        if guard:
            try:
                body_aid = data.get("applicantid") if isinstance(data, dict) else None
                header_aid = request.headers.get("X-Applicant-Id")
                if (
                    body_aid is not None
                    and int(body_aid) == int(applicantid)
                    or (header_aid is not None and int(header_aid) == int(applicantid))
                ):
                    pass
                else:
                    current_app.logger.info(
                        "update_engagement_scoped_bp: authorization failed for applicantid=%s",
                        applicantid,
                    )
                    return guard
            except Exception:
                current_app.logger.info(
                    "update_engagement_scoped_bp: authorization fallback parse error"
                )
                return guard
        try:
            result = _engagement_update_impl(applicantid, engagement_id, data)
            return result
        except Exception as e:
            current_app.logger.exception("_engagement_update_impl failed: %s", e)
            return (jsonify({"error": "An unexpected server error occurred."}), 500)
    except Exception as e:
        current_app.logger.exception("update_engagement_scoped_bp error: %s", e)
        return (jsonify({"error": "An unexpected server error occurred."}), 500)
