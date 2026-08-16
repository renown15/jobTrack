from flask import Blueprint, request, session, jsonify
import secrets
from werkzeug.security import generate_password_hash, check_password_hash
from jobtrack_core import db as jobdb

api = Blueprint("auth", __name__)


@api.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    try:
        # logging is handled by app.logger in application context
        pass
    except Exception:
        pass
    if not email or not password:
        return (jsonify({"error": "Missing credentials"}), 400)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
                cursor.execute(
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
                    LIMIT 1;""",
                    (email,),
                )
                row = cursor.fetchone()
                if not row:
                    return (jsonify({"error": "Invalid credentials"}), 401)
                if row.get("is_active") is False:
                    return (jsonify({"error": "Account disabled"}), 403)
                pwd_hash = row.get("password_hash")
                if not pwd_hash:
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
                except ValueError:
                    new_hash = None
                    try:
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
                    except Exception:
                        new_hash = None
                    if new_hash:
                        try:
                            valid = check_password_hash(new_hash, password)
                        except Exception:
                            valid = False
                if not valid:
                    return (jsonify({"error": "Invalid credentials"}), 401)
                cursor.execute(
                    "UPDATE applicantprofile SET lastlogin = now() WHERE applicantid = %s;",
                    (row["applicantid"],),
                )
                row.pop("password_hash", None)
                session["applicantid"] = row["applicantid"]
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
    except Exception:
        # Delegate detailed logging/trace display to app-level handlers
        return (
            jsonify({"error": "Server error during login", "details": "internal"}),
            500,
        )


@api.route("/api/auth/logout", methods=["POST"])
def api_logout():
    session.pop("applicantid", None)
    session.pop("csrf_token", None)
    return (jsonify({"ok": True}), 200)


@api.route("/api/auth/setup-password", methods=["POST", "OPTIONS"])
def api_setup_password():
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
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
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
                return (
                    jsonify({"ok": True, "message": "Password set successfully"}),
                    200,
                )
    except Exception:
        return (jsonify({"error": "Server error"}), 500)


@api.route("/api/auth/reset-password", methods=["POST", "OPTIONS"])
def api_reset_password():
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
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
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
                    try:
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
                    except Exception:
                        new_hash = None
                    if new_hash:
                        try:
                            valid = check_password_hash(new_hash, current_password)
                        except Exception:
                            valid = False
                if not valid:
                    return (jsonify({"error": "Current password is incorrect"}), 401)
                new_hash = generate_password_hash(new_password)
                cursor.execute(
                    "UPDATE applicantprofile SET passwordhash = %s WHERE applicantid = %s;",
                    (new_hash, applicantid),
                )
                conn.commit()
                return (
                    jsonify({"ok": True, "message": "Password reset successfully"}),
                    200,
                )
    except Exception:
        return (jsonify({"error": "Server error"}), 500)


@api.route("/api/auth/me", methods=["GET"])
def api_me():
    applicantid = session.get("applicantid")
    if not applicantid:
        return (jsonify({"ok": False, "error": "Not authenticated"}), 401)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT
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
                if not row:
                    return (jsonify({"ok": False, "error": "Not found"}), 404)
                row.pop("password_hash", None)
                resp = {"ok": True, "applicant": row}
                try:
                    if session.get("csrf_token"):
                        resp["csrf_token"] = session.get("csrf_token")
                except Exception:
                    pass
                return (jsonify(resp), 200)
    except Exception:
        return (jsonify({"ok": False, "error": "Server error"}), 500)
