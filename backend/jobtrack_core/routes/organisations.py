from flask import Blueprint, request, jsonify, current_app as app
from psycopg2.extras import RealDictCursor
import psycopg2
from jobtrack_core import db as jobdb
from jobtrack_core import jobutils

api = Blueprint("organisations", __name__)


@api.route("/api/<int:applicantid>/organisations/count", methods=["GET"])
def get_organisations_count(applicantid):
    try:
        try:
            applicantid = int(applicantid)
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


@api.route("/api/<int:applicantid>/organisations", methods=["GET"])
def get_organisations(applicantid):
    try:
        try:
            applicantid = int(applicantid)
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cto_table = None
                try:
                    cto_table = jobutils.contacttarget_table_name(conn)
                except Exception:
                    cto_table = "public.contacttargetorganisation"
                sql = f"""
                    SELECT 
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
                _contact_count_raw = (
                    row.get("count")
                    if isinstance(row, dict) and row.get("count") is not None
                    else (row[0] if row and len(row) > 0 else 0)
                )
                contact_count = int(_contact_count_raw or 0)
                cursor.execute(
                    "SELECT COUNT(*) FROM jobrole WHERE companyorgid = %s AND applicantid = %s;",
                    (orgid, applicantid),
                )
                row = cursor.fetchone()
                _jobrole_count_raw = (
                    row.get("count")
                    if isinstance(row, dict) and row.get("count") is not None
                    else (row[0] if row and len(row) > 0 else 0)
                )
                jobrole_count = int(_jobrole_count_raw or 0)
                cursor.execute(
                    "SELECT COUNT(*) FROM public.contacttargetorganisation WHERE targetid = %s AND applicantid = %s;",
                    (orgid, applicantid),
                )
                row = cursor.fetchone()
                _target_count_raw = (
                    row.get("count")
                    if isinstance(row, dict) and row.get("count") is not None
                    else (row[0] if row and len(row) > 0 else 0)
                )
                target_count = int(_target_count_raw or 0)
                total_refs = (
                    (contact_count or 0) + (jobrole_count or 0) + (target_count or 0)
                )
                if total_refs > 0:
                    return (
                        jsonify(
                            {
                                "error": "Cannot delete: organisation is referenced by other records",
                                "details": {
                                    "contacts": int(contact_count or 0),
                                    "jobroles": int(jobrole_count or 0),
                                    "targets": int(target_count or 0),
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


@api.route("/api/<int:applicantid>/organisations/<int:orgid>", methods=["GET"])
def get_organisation(applicantid, orgid):
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
                        org["created_at"] = org["created_at"].strftime("%Y-%m-%d")
                    except Exception:
                        org["created_at"] = str(org["created_at"])
                if org.get("updated_at"):
                    try:
                        org["updated_at"] = org["updated_at"].strftime("%Y-%m-%d")
                    except Exception:
                        org["updated_at"] = str(org["updated_at"])
                return (jsonify(org), 200)
    except Exception as e:
        print(f"❌ Error fetching organisation {orgid}: {e}")
        return (jsonify({"error": "Failed to fetch organisation"}), 500)


@api.route("/api/<int:applicantid>/organisations", methods=["POST"])
def create_organisation_scoped(applicantid):
    data = request.get_json() or {}
    try:
        applicantid = int(applicantid)
    except Exception:
        return (jsonify({"error": "Invalid applicantid"}), 400)
    return _org_create_impl(applicantid, data)


@api.route("/api/<int:applicantid>/organisations/<int:orgid>", methods=["PUT"])
def update_organisation_scoped(applicantid, orgid):
    data = request.get_json() or {}
    try:
        applicantid = int(applicantid)
    except Exception:
        return (jsonify({"error": "Invalid applicantid"}), 400)
    return _org_update_impl(applicantid, orgid, data)


@api.route("/api/<int:applicantid>/organisations/<int:orgid>", methods=["DELETE"])
def delete_organisation_scoped(applicantid, orgid):
    try:
        applicantid = int(applicantid)
    except Exception:
        return (jsonify({"error": "Invalid applicantid"}), 400)
    return _org_delete_impl(applicantid, orgid)


@api.route("/api/<int:applicantid>/organisations/<int:orgid>/contacts", methods=["GET"])
def get_organisation_contacts(applicantid, orgid):
    try:
        try:
            applicantid = int(applicantid)
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
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
