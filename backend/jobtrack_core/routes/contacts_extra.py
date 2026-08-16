from flask import Blueprint, jsonify, request, current_app
import psycopg2
from jobtrack_core import db as jobdb
from jobtrack_core.request_utils import require_applicant_allowed

api = Blueprint("contacts_extra", __name__)


def _contacttarget_table_name(conn):
    """Detect contact-target table name; fallback to legacy name."""
    try:
        with conn.cursor() as _:
            return "public.contacttargetorganisation"
    except Exception:
        return "public.contacttargetorganisation"


@api.route("/api/<int:applicantid>/contacts/<int:contact_id>/targets", methods=["POST"])
def add_contact_target_scoped(applicantid, contact_id):
    """Scoped: Add a mapping from contact -> organisation for the given applicant."""
    data = request.get_json() or {}
    orgid = data.get("orgid")
    org_name = data.get("org_name") or data.get("name")
    try:
        try:
            applicantid = int(applicantid)
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT contactid FROM Contact WHERE contactid = %s AND applicantid = %s LIMIT 1;",
                    (contact_id, applicantid),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Contact not found"}), 404)
                resolved_orgid = None
                if orgid is not None:
                    try:
                        resolved_orgid = int(orgid)
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
                        resolved_orgid = (
                            orgrow.get("orgid")
                            if isinstance(orgrow, dict)
                            else orgrow[0]
                        )
                    else:
                        cursor.execute(
                            "INSERT INTO Organisation (name, applicantid) VALUES (%s, %s) RETURNING orgid, name;",
                            (org_name, applicantid),
                        )
                        orgrow = cursor.fetchone()
                        resolved_orgid = (
                            orgrow.get("orgid")
                            if isinstance(orgrow, dict)
                            else orgrow[0]
                        )
                else:
                    return (
                        jsonify({"error": "Missing required field: orgid or org_name"}),
                        400,
                    )
                cto_table = _contacttarget_table_name(conn)
                cursor.execute(
                    f"INSERT INTO {cto_table} (contactid, targetid, applicantid) SELECT %s, %s, %s WHERE NOT EXISTS (SELECT 1 FROM {cto_table} WHERE contactid = %s AND targetid = %s AND applicantid = %s) RETURNING id;",
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
        current_app.logger.exception("PostgreSQL Error adding contact target (scoped)")
        return (jsonify({"error": "Database error adding contact target."}), 500)
    except Exception:
        current_app.logger.exception("Error adding contact target (scoped)")
        return (jsonify({"error": "Unexpected server error."}), 500)


@api.route(
    "/api/<int:applicantid>/contacts/<int:contact_id>/targets/<int:targetid>",
    methods=["DELETE"],
)
def remove_contact_target_scoped(applicantid, contact_id, targetid):
    """Scoped: Remove a mapping between a contact and a target organisation."""
    try:
        try:
            applicantid = int(applicantid)
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
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
    except psycopg2.Error:
        current_app.logger.exception(
            "PostgreSQL Error removing contact target (scoped)"
        )
        return (jsonify({"error": "Database error removing contact target."}), 500)
    except Exception:
        current_app.logger.exception("Error removing contact target (scoped)")
        return (jsonify({"error": "Unexpected server error."}), 500)
