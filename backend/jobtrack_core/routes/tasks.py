from flask import Blueprint, jsonify, request, current_app
import psycopg2
from jobtrack_core import db as jobdb
from jobtrack_core.request_utils import require_applicant_allowed

api = Blueprint("tasks", __name__)


@api.route("/api/<int:applicantid>/tasks", methods=["GET"])
def list_tasks(applicantid):
    """List tasks. Optional query param: applicantid to filter by applicant."""
    try:
        try:
            applicantid = int(applicantid)
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT taskid, applicantid, name, duedate, notes, created_at, updated_at FROM public.task WHERE applicantid = %s ORDER BY duedate NULLS LAST, taskid DESC",
                    (applicantid,),
                )
                rows = cursor.fetchall()
        return (jsonify(rows), 200)
    except psycopg2.Error as e:
        current_app.logger.error("PostgreSQL Error listing tasks: %s", e)
        return (jsonify({"error": "Database error listing tasks."}), 500)
    except Exception as e:
        current_app.logger.exception("Unexpected error listing tasks: %s", e)
        return (jsonify({"error": "Unexpected error"}), 500)


@api.route("/api/<int:applicantid>/tasks", methods=["POST"])
def create_task_scoped(applicantid):
    """Create a new task scoped to an applicant."""
    if request.method == "OPTIONS":
        return ("", 200)
    data = request.get_json() or {}
    try:
        try:
            applicantid = int(applicantid)
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        name = data.get("name")
        duedate = data.get("duedate")
        notes = data.get("notes")
        if not name or not str(name).strip():
            return (jsonify({"error": "Missing required field: name"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
                cursor.execute(
                    "INSERT INTO public.task (applicantid, name, duedate, notes) VALUES (%s, %s, %s, %s) RETURNING taskid, applicantid, name, duedate, notes, created_at, updated_at",
                    (applicantid, name.strip(), duedate or None, notes or None),
                )
                row = cursor.fetchone()
        if row and row.get("duedate"):
            try:
                row["duedate"] = row["duedate"].strftime("%Y-%m-%d")
            except Exception:
                row["duedate"] = str(row["duedate"])
        return (jsonify(row), 201)
    except psycopg2.Error as e:
        current_app.logger.error("PostgreSQL Error creating task: %s", e)
        return (jsonify({"error": "Database error creating task."}), 500)
    except Exception as e:
        current_app.logger.exception("Unexpected error creating task: %s", e)
        return (jsonify({"error": "Unexpected error"}), 500)


@api.route("/api/<int:applicantid>/tasks/<int:taskid>", methods=["PUT"])
def update_task_scoped(applicantid, taskid):
    """Update an existing task scoped to an applicant."""
    data = request.get_json() or {}
    try:
        try:
            applicantid = int(applicantid)
            taskid = int(taskid)
        except Exception:
            return (jsonify({"error": "Invalid id"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        name = data.get("name")
        duedate = data.get("duedate")
        notes = data.get("notes")
        if name is None and duedate is None and (notes is None):
            return (jsonify({"error": "No fields to update"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
                updates = []
                params = []
                if name is not None:
                    updates.append("name = %s")
                    params.append(name.strip())
                if duedate is not None:
                    updates.append("duedate = %s")
                    params.append(duedate or None)
                if notes is not None:
                    updates.append("notes = %s")
                    params.append(notes or None)
                params.extend([taskid, applicantid])
                sql = f"UPDATE public.task SET {', '.join(updates)}, updated_at = now() WHERE taskid = %s AND applicantid = %s RETURNING taskid, applicantid, name, duedate, notes, created_at, updated_at"
                cursor.execute(sql, tuple(params))
                row = cursor.fetchone()
        if not row:
            return (jsonify({"error": "Task not found"}), 404)
        if row.get("duedate"):
            try:
                row["duedate"] = row["duedate"].strftime("%Y-%m-%d")
            except Exception:
                row["duedate"] = str(row["duedate"])
        return (jsonify(row), 200)
    except psycopg2.Error as e:
        current_app.logger.error("PostgreSQL Error updating task: %s", e)
        return (jsonify({"error": "Database error updating task."}), 500)
    except Exception as e:
        current_app.logger.exception("Unexpected error updating task: %s", e)
        return (jsonify({"error": "Unexpected error"}), 500)


@api.route("/api/<int:applicantid>/tasks/<int:taskid>", methods=["DELETE"])
def delete_task_scoped(applicantid, taskid):
    """Delete a task scoped to an applicant."""
    try:
        try:
            applicantid = int(applicantid)
            taskid = int(taskid)
        except Exception:
            return (jsonify({"error": "Invalid id"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
                cursor.execute(
                    "DELETE FROM public.task WHERE taskid = %s AND applicantid = %s RETURNING taskid",
                    (taskid, applicantid),
                )
                row = cursor.fetchone()
        if not row:
            return (jsonify({"error": "Task not found"}), 404)
        return (jsonify({"ok": True}), 200)
    except psycopg2.Error as e:
        current_app.logger.error("PostgreSQL Error deleting task: %s", e)
        return (jsonify({"error": "Database error deleting task."}), 500)
    except Exception as e:
        current_app.logger.exception("Unexpected error deleting task: %s", e)
        return (jsonify({"error": "Unexpected error"}), 500)
