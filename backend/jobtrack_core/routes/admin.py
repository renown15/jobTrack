from flask import Blueprint, request, session, jsonify, current_app as app
from psycopg2.extras import RealDictCursor
from datetime import datetime
from jobtrack_core import db as jobdb

api = Blueprint("admin", __name__)


@api.route("/api/admin/applicants", methods=["GET", "OPTIONS"])
def admin_applicants():
    """
    Return a list of applicants with basic counts for admin/superuser usage.
    Guarded: only accessible if the requesting session's applicant is a superuser.
    """
    applicantid = session.get("applicantid")
    if request.method == "OPTIONS":
        return ("", 200)
    if not applicantid:
        return (jsonify({"error": "Not authenticated"}), 401)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # ensure requester is a superuser
                cursor.execute(
                    "SELECT issuperuser FROM applicantprofile WHERE applicantid = %s LIMIT 1;",
                    (applicantid,),
                )
                row = cursor.fetchone()
                if not row or not row.get("issuperuser"):
                    return (jsonify({"error": "Forbidden"}), 403)

                cursor.execute(
                    """
                          SELECT ap.applicantid,
                              ap.firstname,
                              ap.lastname,
                              ap.email,
                                ap.isactive,
                                ap.issuperuser,
                              ap.passwordhash,
                              ap.lastlogin AS last_login,
                           COALESCE((SELECT COUNT(*) FROM contact c WHERE c.applicantid = ap.applicantid), 0) AS contacts_count,
                           COALESCE((SELECT COUNT(*) FROM organisation o WHERE o.applicantid = ap.applicantid), 0) AS organisations_count,
                           COALESCE((SELECT COUNT(*) FROM jobrole j WHERE j.applicantid = ap.applicantid), 0) AS roles_count,
                           COALESCE((SELECT COUNT(*) FROM engagementlog e WHERE e.applicantid = ap.applicantid), 0) AS engagements_count,
                           COALESCE((SELECT COUNT(*) FROM networkingevent ne WHERE ne.applicantid = ap.applicantid), 0) AS networking_count,
                           COALESCE((SELECT COUNT(*) FROM public.task t WHERE t.applicantid = ap.applicantid), 0) AS actions_count,
                           COALESCE((SELECT COUNT(*) FROM public.navigatorapplicantbriefing nab WHERE nab.applicantid = ap.applicantid), 0) AS navigator_snapshots_count,
                           COALESCE((SELECT COUNT(*) FROM public.lead l WHERE l.applicantid = ap.applicantid), 0) AS leads_count
                    FROM applicantprofile ap
                    ORDER BY ap.applicantid;
                    """,
                )
                rows = cursor.fetchall()
        out = []
        for r in rows or []:
            out.append(
                {
                    "applicantId": int(r.get("applicantid")),
                    "firstName": r.get("firstname") or "",
                    "lastName": r.get("lastname") or "",
                    "email": r.get("email") or "",
                    "isActive": bool(r.get("isactive")),
                    "isSuperuser": bool(r.get("issuperuser")),
                    "hasPassword": bool(r.get("passwordhash")),
                    "lastLogin": r.get("last_login"),
                    "contactsCount": int(r.get("contacts_count") or 0),
                    "organisationsCount": int(r.get("organisations_count") or 0),
                    "rolesCount": int(r.get("roles_count") or 0),
                    "engagementsCount": int(r.get("engagements_count") or 0),
                    "networkingCount": int(r.get("networking_count") or 0),
                    "actionsCount": int(r.get("actions_count") or 0),
                    "navigatorSnapshotsCount": int(
                        r.get("navigator_snapshots_count") or 0
                    ),
                    "leadsCount": int(r.get("leads_count") or 0),
                }
            )
        return jsonify(out)
    except Exception:
        app.logger.exception("Error fetching admin applicants summary")
        return (jsonify({"error": "Server error"}), 500)


@api.route("/api/admin/applicants/summary", methods=["GET", "OPTIONS"])
def admin_applicants_summary():
    """Compatibility endpoint using a different path to avoid generic OPTIONS route conflicts."""
    try:
        return admin_applicants()
    except Exception:
        app.logger.exception("Error in admin_applicants_summary wrapper")
        return (jsonify({"error": "Server error"}), 500)


@api.route(
    "/api/admin/applicants/<int:target_applicantid>/status",
    methods=["PATCH", "OPTIONS"],
)
def admin_update_applicant_status(target_applicantid):
    if request.method == "OPTIONS":
        return ("", 200)
    applicantid = session.get("applicantid")
    if not applicantid:
        return (jsonify({"error": "Not authenticated"}), 401)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT issuperuser FROM applicantprofile WHERE applicantid = %s LIMIT 1;",
                    (applicantid,),
                )
                row = cursor.fetchone()
                if not row or not row.get("issuperuser"):
                    return (jsonify({"error": "Forbidden"}), 403)
                if applicantid == target_applicantid:
                    return (
                        jsonify({"error": "You cannot modify your own status"}),
                        403,
                    )
                data = request.get_json() or {}
                is_active = data.get("isActive")
                if is_active is None:
                    return (jsonify({"error": "Missing isActive field"}), 400)
                cursor.execute(
                    "UPDATE applicantprofile SET isactive = %s WHERE applicantid = %s;",
                    (bool(is_active), target_applicantid),
                )
                conn.commit()
                app.logger.info(
                    "Superuser %s updated applicant %s isactive to %s",
                    applicantid,
                    target_applicantid,
                    is_active,
                )
                return (jsonify({"ok": True, "isActive": bool(is_active)}), 200)
    except Exception:
        app.logger.exception("Error updating applicant status")
        return (jsonify({"error": "Server error"}), 500)


@api.route(
    "/api/admin/applicants/<int:target_applicantid>/superuser",
    methods=["PATCH", "OPTIONS"],
)
def admin_update_applicant_superuser(target_applicantid):
    if request.method == "OPTIONS":
        return ("", 200)
    applicantid = session.get("applicantid")
    if not applicantid:
        return (jsonify({"error": "Not authenticated"}), 401)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT issuperuser FROM applicantprofile WHERE applicantid = %s LIMIT 1;",
                    (applicantid,),
                )
                row = cursor.fetchone()
                if not row or not row.get("issuperuser"):
                    return (jsonify({"error": "Forbidden"}), 403)
                if applicantid == target_applicantid:
                    return (
                        jsonify(
                            {"error": "You cannot modify your own superuser status"}
                        ),
                        403,
                    )
                data = request.get_json() or {}
                is_super = data.get("isSuperuser")
                if is_super is None:
                    return (jsonify({"error": "Missing isSuperuser field"}), 400)
                cursor.execute(
                    "UPDATE applicantprofile SET issuperuser = %s WHERE applicantid = %s;",
                    (bool(is_super), target_applicantid),
                )
                conn.commit()
                app.logger.info(
                    "Superuser %s updated applicant %s issuperuser to %s",
                    applicantid,
                    target_applicantid,
                    is_super,
                )
                return (jsonify({"ok": True, "isSuperuser": bool(is_super)}), 200)
    except Exception:
        app.logger.exception("Error updating applicant superuser status")
        return (jsonify({"error": "Server error"}), 500)


@api.route(
    "/api/admin/applicants/<int:target_applicantid>/password",
    methods=["DELETE", "OPTIONS"],
)
def admin_clear_applicant_password(target_applicantid):
    if request.method == "OPTIONS":
        return ("", 200)
    applicantid = session.get("applicantid")
    if not applicantid:
        return (jsonify({"error": "Not authenticated"}), 401)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT issuperuser FROM applicantprofile WHERE applicantid = %s LIMIT 1;",
                    (applicantid,),
                )
                row = cursor.fetchone()
                if not row or not row.get("issuperuser"):
                    return (jsonify({"error": "Forbidden"}), 403)
                cursor.execute(
                    "UPDATE applicantprofile SET passwordhash = NULL WHERE applicantid = %s;",
                    (target_applicantid,),
                )
                conn.commit()
                app.logger.info(
                    "Superuser %s cleared password for applicant %s",
                    applicantid,
                    target_applicantid,
                )
                return (jsonify({"ok": True}), 200)
    except Exception:
        app.logger.exception("Error clearing applicant password")
        return (jsonify({"error": "Server error"}), 500)


@api.route(
    "/api/admin/applicants/<int:target_applicantid>", methods=["DELETE", "OPTIONS"]
)
def admin_delete_applicant(target_applicantid):
    if request.method == "OPTIONS":
        return ("", 200)
    applicantid = session.get("applicantid")
    if not applicantid:
        return (jsonify({"error": "Not authenticated"}), 401)
    if applicantid == target_applicantid:
        return (jsonify({"error": "You cannot delete your own account"}), 403)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT issuperuser FROM applicantprofile WHERE applicantid = %s LIMIT 1;",
                    (applicantid,),
                )
                row = cursor.fetchone()
                if not row or not row.get("issuperuser"):
                    return (jsonify({"error": "Forbidden"}), 403)
                cursor.execute(
                    "SELECT email, firstname, lastname FROM applicantprofile WHERE applicantid = %s LIMIT 1;",
                    (target_applicantid,),
                )
                target_row = cursor.fetchone()
                if not target_row:
                    return (jsonify({"error": "Applicant not found"}), 404)
                target_email = target_row.get("email")
                target_name = (
                    f"{target_row.get('firstname')} {target_row.get('lastname')}"
                )
                cursor.execute(
                    "DELETE FROM applicantprofile WHERE applicantid = %s;",
                    (target_applicantid,),
                )
                conn.commit()
                app.logger.info(
                    "Superuser %s deleted applicant %s (email=%s, name=%s)",
                    applicantid,
                    target_applicantid,
                    target_email,
                    target_name,
                )
                return (jsonify({"ok": True}), 200)
    except Exception:
        app.logger.exception("Error deleting applicant")
        return (jsonify({"error": "Server error"}), 500)


@api.route(
    "/api/admin/applicants/<int:target_applicantid>/export", methods=["GET", "OPTIONS"]
)
def admin_export_applicant(target_applicantid):
    if request.method == "OPTIONS":
        return ("", 200)
    applicantid = session.get("applicantid")
    if not applicantid:
        return (jsonify({"error": "Not authenticated"}), 401)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT issuperuser FROM applicantprofile WHERE applicantid = %s LIMIT 1;",
                    (applicantid,),
                )
                row = cursor.fetchone()
                if not row or not row.get("issuperuser"):
                    return (jsonify({"error": "Forbidden"}), 403)
                cursor.execute(
                    "SELECT * FROM applicantprofile WHERE applicantid = %s;",
                    (target_applicantid,),
                )
                profile = cursor.fetchone()
                if not profile:
                    return (jsonify({"error": "Applicant not found"}), 404)
                export_data = {
                    "export_version": "1.0",
                    "export_date": datetime.now().isoformat(),
                    "applicant_profile": dict(profile),
                }
                cursor.execute(
                    """SELECT c.*, rd.refdataclass, rd.refvalue as roletypevalue 
                       FROM contact c 
                       LEFT JOIN referencedata rd ON c.roletypeid = rd.refid 
                       WHERE c.applicantid = %s;""",
                    (target_applicantid,),
                )
                export_data["contacts"] = [dict(r) for r in cursor.fetchall()]
                cursor.execute(
                    """SELECT o.*, s.summary as sectorname 
                       FROM organisation o 
                       LEFT JOIN sector s ON o.sectorid = s.sectorid 
                       WHERE o.applicantid = %s;""",
                    (target_applicantid,),
                )
                export_data["organisations"] = [dict(r) for r in cursor.fetchall()]
                cursor.execute(
                    """SELECT jr.*, 
                              rd_status.refdataclass as statusclass, rd_status.refvalue as statusvalue
                       FROM jobrole jr 
                       LEFT JOIN referencedata rd_status ON jr.statusid = rd_status.refid 
                       WHERE jr.applicantid = %s;""",
                    (target_applicantid,),
                )
                export_data["job_roles"] = [dict(r) for r in cursor.fetchall()]
                cursor.execute(
                    """SELECT el.*, rd.refdataclass as engagementclass, rd.refvalue as engagementvalue 
                       FROM engagementlog el 
                       LEFT JOIN referencedata rd ON el.engagementtypeid = rd.refid 
                       WHERE el.applicantid = %s;""",
                    (target_applicantid,),
                )
                export_data["engagements"] = [dict(r) for r in cursor.fetchall()]
                cursor.execute(
                    """SELECT d.*, rd.refdataclass as doctypeclass, rd.refvalue as doctypevalue 
                       FROM document d 
                       LEFT JOIN referencedata rd ON d.documenttypeid = rd.refid 
                       WHERE d.applicantid = %s;""",
                    (target_applicantid,),
                )
                export_data["documents"] = [dict(r) for r in cursor.fetchall()]
                cursor.execute(
                    "SELECT * FROM networkingevent WHERE applicantid = %s;",
                    (target_applicantid,),
                )
                export_data["networking_events"] = [dict(r) for r in cursor.fetchall()]
                cursor.execute(
                    "SELECT * FROM task WHERE applicantid = %s;", (target_applicantid,)
                )
                export_data["tasks"] = [dict(r) for r in cursor.fetchall()]
                cursor.execute(
                    "SELECT * FROM lead WHERE applicantid = %s;", (target_applicantid,)
                )
                export_data["leads"] = [dict(r) for r in cursor.fetchall()]
                cursor.execute(
                    "SELECT * FROM contacttargetorganisation WHERE applicantid = %s;",
                    (target_applicantid,),
                )
                export_data["contact_target_organisations"] = [
                    dict(r) for r in cursor.fetchall()
                ]
                cursor.execute(
                    "SELECT * FROM engagementdocument WHERE applicantid = %s;",
                    (target_applicantid,),
                )
                export_data["engagement_documents"] = [
                    dict(r) for r in cursor.fetchall()
                ]
                cursor.execute(
                    "SELECT * FROM navigatorapplicantbriefing WHERE applicantid = %s;",
                    (target_applicantid,),
                )
                export_data["navigator_briefings"] = [
                    dict(r) for r in cursor.fetchall()
                ]
                app.logger.info(
                    "Superuser %s exported applicant %s (%s)",
                    applicantid,
                    target_applicantid,
                    profile.get("email"),
                )
                return (jsonify(export_data), 200)
    except Exception:
        app.logger.exception("Error exporting applicant")
        return (jsonify({"error": "Server error"}), 500)


@api.route("/api/admin/applicants/import", methods=["POST", "OPTIONS"])
def admin_import_applicant():
    if request.method == "OPTIONS":
        return ("", 200)
    applicantid = session.get("applicantid")
    if not applicantid:
        return (jsonify({"error": "Not authenticated"}), 401)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    "SELECT issuperuser FROM applicantprofile WHERE applicantid = %s LIMIT 1;",
                    (applicantid,),
                )
                row = cursor.fetchone()
                if not row or not row.get("issuperuser"):
                    return (jsonify({"error": "Forbidden"}), 403)
                data = request.get_json() or {}
                target_applicantid = data.get("target_applicantid")
                if not target_applicantid:
                    return (jsonify({"error": "Missing target_applicantid"}), 400)
                cursor.execute(
                    "SELECT applicantid FROM applicantprofile WHERE applicantid = %s LIMIT 1;",
                    (target_applicantid,),
                )
                if not cursor.fetchone():
                    return (jsonify({"error": "Target applicant not found"}), 404)

                def get_refdata_id(refdataclass, refvalue):
                    if not refdataclass or not refvalue:
                        return None
                    cursor.execute(
                        "SELECT refid FROM referencedata WHERE refdataclass = %s AND refvalue = %s LIMIT 1;",
                        (refdataclass, refvalue),
                    )
                    row = cursor.fetchone()
                    return row["refid"] if row else None

                def get_sector_id(sectorname):
                    if not sectorname:
                        return None
                    cursor.execute(
                        "SELECT sectorid FROM sector WHERE summary = %s LIMIT 1;",
                        (sectorname,),
                    )
                    row = cursor.fetchone()
                    return row["sectorid"] if row else None

                contact_id_map = {}
                org_id_map = {}
                role_id_map = {}
                engagement_id_map = {}
                document_id_map = {}
                lead_id_map = {}
                for org in data.get("organisations", []):
                    sector_id = get_sector_id(org.get("sectorname"))
                    cursor.execute(
                        """INSERT INTO organisation 
                           (applicantid, name, sectorid, talentcommunitydateadded)
                           VALUES (%s, %s, %s, %s)
                           RETURNING orgid;""",
                        (
                            target_applicantid,
                            org.get("name"),
                            sector_id,
                            org.get("talentcommunitydateadded"),
                        ),
                    )
                    new_orgid = cursor.fetchone()["orgid"]
                    org_id_map[org.get("orgid")] = new_orgid
                for lead in data.get("leads", []):
                    cursor.execute(
                        """INSERT INTO lead 
                           (applicantid, firstname, lastname, company, jobtitle, email, linkedin)
                           VALUES (%s, %s, %s, %s, %s, %s, %s)
                           RETURNING leadid;""",
                        (
                            target_applicantid,
                            lead.get("firstname"),
                            lead.get("lastname"),
                            lead.get("company"),
                            lead.get("jobtitle"),
                            lead.get("email"),
                            lead.get("linkedin"),
                        ),
                    )
                    new_leadid = cursor.fetchone()["leadid"]
                    lead_id_map[lead.get("leadid")] = new_leadid
                for contact in data.get("contacts", []):
                    old_currentorgid = contact.get("currentorgid")
                    new_currentorgid = (
                        org_id_map.get(old_currentorgid) if old_currentorgid else None
                    )
                    old_leadid = contact.get("leadid")
                    new_leadid = lead_id_map.get(old_leadid) if old_leadid else None
                    roletypeid = get_refdata_id(
                        contact.get("refdataclass"), contact.get("roletypevalue")
                    )
                    cursor.execute(
                        """INSERT INTO contact 
                           (applicantid, name, currentorgid, roletypeid, leadid)
                           VALUES (%s, %s, %s, %s, %s)
                           RETURNING contactid;""",
                        (
                            target_applicantid,
                            contact.get("name"),
                            new_currentorgid,
                            roletypeid,
                            new_leadid,
                        ),
                    )
                    new_contactid = cursor.fetchone()["contactid"]
                    contact_id_map[contact.get("contactid")] = new_contactid
                for role in data.get("job_roles", []):
                    new_contactid = contact_id_map.get(role.get("contactid"))
                    new_companyorgid = org_id_map.get(role.get("companyorgid"))
                    statusid = get_refdata_id(
                        role.get("statusclass"), role.get("statusvalue")
                    )
                    cursor.execute(
                        """INSERT INTO jobrole 
                           (applicantid, contactid, companyorgid, rolename, applicationdate, statusid)
                           VALUES (%s, %s, %s, %s, %s, %s)
                           RETURNING jobid;""",
                        (
                            target_applicantid,
                            new_contactid,
                            new_companyorgid,
                            role.get("rolename"),
                            role.get("applicationdate"),
                            statusid,
                        ),
                    )
                    new_jobid = cursor.fetchone()["jobid"]
                    role_id_map[role.get("jobid")] = new_jobid
                for eng in data.get("engagements", []):
                    new_contactid = contact_id_map.get(eng.get("contactid"))
                    engagementtypeid = get_refdata_id(
                        eng.get("engagementclass"), eng.get("engagementvalue")
                    )
                    cursor.execute(
                        """INSERT INTO engagementlog 
                           (applicantid, contactid, logdate, engagementtypeid, logentry)
                           VALUES (%s, %s, %s, %s, %s)
                           RETURNING engagementlogid;""",
                        (
                            target_applicantid,
                            new_contactid,
                            eng.get("logdate"),
                            engagementtypeid,
                            eng.get("logentry"),
                        ),
                    )
                    new_engid = cursor.fetchone()["engagementlogid"]
                    engagement_id_map[eng.get("engagementlogid")] = new_engid
                for doc in data.get("documents", []):
                    documenttypeid = get_refdata_id(
                        doc.get("doctypeclass"), doc.get("doctypevalue")
                    )
                    cursor.execute(
                        """INSERT INTO document 
                           (applicantid, documentname, documenttypeid, filepath, uploaddate)
                           VALUES (%s, %s, %s, %s, %s)
                           RETURNING documentid;""",
                        (
                            target_applicantid,
                            doc.get("documentname"),
                            documenttypeid,
                            doc.get("filepath"),
                            doc.get("uploaddate"),
                        ),
                    )
                    new_docid = cursor.fetchone()["documentid"]
                    document_id_map[doc.get("documentid")] = new_docid
                for event in data.get("networking_events", []):
                    cursor.execute(
                        """INSERT INTO networkingevent 
                           (applicantid, eventname, eventdate, location, notes)
                           VALUES (%s, %s, %s, %s, %s);""",
                        (
                            target_applicantid,
                            event.get("eventname"),
                            event.get("eventdate"),
                            event.get("location"),
                            event.get("notes"),
                        ),
                    )
                for task in data.get("tasks", []):
                    cursor.execute(
                        """INSERT INTO task 
                           (applicantid, taskdescription, duedate, completed, priority)
                           VALUES (%s, %s, %s, %s, %s);""",
                        (
                            target_applicantid,
                            task.get("taskdescription"),
                            task.get("duedate"),
                            task.get("completed"),
                            task.get("priority"),
                        ),
                    )
                for cto in data.get("contact_target_organisations", []):
                    new_contactid = contact_id_map.get(cto.get("contactid"))
                    new_orgid = org_id_map.get(cto.get("orgid"))
                    if new_contactid and new_orgid:
                        cursor.execute(
                            """INSERT INTO contacttargetorganisation (applicantid, contactid, orgid)
                               VALUES (%s, %s, %s);""",
                            (target_applicantid, new_contactid, new_orgid),
                        )
                for ed in data.get("engagement_documents", []):
                    new_engid = engagement_id_map.get(ed.get("engagementlogid"))
                    new_docid = document_id_map.get(ed.get("documentid"))
                    if new_engid and new_docid:
                        cursor.execute(
                            """INSERT INTO engagementdocument (applicantid, engagementlogid, documentid)
                               VALUES (%s, %s, %s);""",
                            (target_applicantid, new_engid, new_docid),
                        )
                conn.commit()
                app.logger.info(
                    "Superuser %s imported applicant data into target applicantid=%s",
                    applicantid,
                    target_applicantid,
                )
                return (jsonify({"ok": True}), 200)
    except Exception:
        app.logger.exception("Error importing applicant")
        return (jsonify({"error": "Server error"}), 500)
