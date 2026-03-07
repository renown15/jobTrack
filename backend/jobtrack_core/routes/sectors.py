from flask import Blueprint, jsonify, request, current_app
import psycopg2
from jobtrack_core import db as jobdb

api = Blueprint("sectors", __name__)


@api.route("/api/<int:applicantid>/sectors", methods=["GET"])
def get_sectors(applicantid):
    """
    Return list of sectors (sectorid, summary) used to populate UI dropdowns.
    """
    try:
        applicantid = int(applicantid)
    except Exception:
        return (jsonify({"error": "Invalid applicantid"}), 400)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT sectorid, summary, description FROM sector ORDER BY summary ASC;"
                )
                rows = cursor.fetchall()
        return (jsonify(rows), 200)
    except psycopg2.Error as e:
        current_app.logger.error("PostgreSQL Error fetching sectors: %s", e)
        return (jsonify({"error": "Database error retrieving sectors."}), 500)
    except Exception as e:
        current_app.logger.error("General Error: %s", e)
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@api.route("/api/sectors", methods=["POST"])
def create_sector():
    """Create a new sector. Accepts JSON {summary, description}."""
    data = request.get_json() or {}
    summary = (data.get("summary") or "").strip()
    if not summary:
        return (jsonify({"error": "Missing required field: summary"}), 400)
    description = data.get("description")
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
                cursor.execute(
                    "INSERT INTO sector (summary, description) VALUES (%s, %s) RETURNING sectorid, summary, description",
                    (summary, description),
                )
                new = cursor.fetchone()
        return (jsonify(new), 201)
    except psycopg2.Error as e:
        current_app.logger.error("PostgreSQL Error creating sector: %s", e)
        return (jsonify({"error": "Database error creating sector."}), 500)
    except Exception as e:
        current_app.logger.exception("Unexpected error creating sector: %s", e)
        return (jsonify({"error": "Unexpected error"}), 500)


@api.route("/api/sectors/<int:sectorid>", methods=["PUT"])
def update_sector(sectorid):
    data = request.get_json() or {}
    summary = data.get("summary")
    description = data.get("description")
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT sectorid FROM sector WHERE sectorid = %s", (sectorid,)
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Sector not found"}), 404)
                cursor.execute(
                    "UPDATE sector SET summary = COALESCE(%s, summary), description = COALESCE(%s, description) WHERE sectorid = %s RETURNING sectorid, summary, description",
                    (summary, description, sectorid),
                )
                updated = cursor.fetchone()
        return (jsonify(updated), 200)
    except psycopg2.Error as e:
        current_app.logger.error("PostgreSQL Error updating sector: %s", e)
        return (jsonify({"error": "Database error updating sector."}), 500)
    except Exception as e:
        current_app.logger.exception("Unexpected error updating sector: %s", e)
        return (jsonify({"error": "Unexpected error"}), 500)


@api.route("/api/sectors/<int:sectorid>", methods=["DELETE"])
def delete_sector(sectorid):
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT sectorid FROM sector WHERE sectorid = %s", (sectorid,)
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Sector not found"}), 404)
                cursor.execute(
                    "SELECT 1 FROM organisation WHERE sectorid = %s LIMIT 1",
                    (sectorid,),
                )
                if cursor.fetchone():
                    return (
                        jsonify(
                            {
                                "error": "Cannot delete sector: organisations reference this sector"
                            }
                        ),
                        400,
                    )
                cursor.execute("DELETE FROM sector WHERE sectorid = %s", (sectorid,))
        return (jsonify({"ok": True}), 200)
    except psycopg2.Error as e:
        current_app.logger.error("PostgreSQL Error deleting sector: %s", e)
        return (jsonify({"error": "Database error deleting sector."}), 500)
    except Exception as e:
        current_app.logger.exception("Unexpected error deleting sector: %s", e)
        return (jsonify({"error": "Unexpected error"}), 500)
