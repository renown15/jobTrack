from flask import Blueprint, jsonify, current_app
from flask.typing import ResponseReturnValue
from psycopg2.extras import RealDictCursor
from datetime import datetime
import psycopg2

from jobtrack_core import jobutils
from jobtrack_core import db as jobdb

export_bp = Blueprint("export", __name__)


@export_bp.route("/api/<int:applicantid>/export", methods=["POST"])
def export_document(applicantid) -> ResponseReturnValue:
    """Create an XLSX workbook of core exports and store as a `document` row in the core DB.

    Returns the created document row (documentid, documentname, documentdescription, documenttypeid).
    """
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)

        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """SELECT c.contactid, c.name, ''::text AS email, ''::text AS phone, c.currentorgid,
          co.name AS current_organisation_name, c.currentrole, c.roletypeid AS role_type_id,
          ''::text AS notes
FROM contact c
LEFT JOIN organisation co ON c.currentorgid = co.orgid
WHERE c.applicantid = %s
ORDER BY c.contactid
""",
                    (applicantid,),
                )
                contacts = cursor.fetchall()

                cursor.execute(
                    """SELECT o.orgid, o.name, s.summary AS sector, o.talentcommunitydateadded, ''::text AS website, ''::text AS notes
FROM organisation o
LEFT JOIN sector s ON o.sectorid = s.sectorid
WHERE o.applicantid = %s
ORDER BY o.orgid
""",
                    (applicantid,),
                )
                organisations = cursor.fetchall()

                cursor.execute(
                    """SELECT j.jobid, j.rolename, j.contactid, c.name AS contact_name,
          j.companyorgid, o.name AS company_name, j.applicationdate, j.statusid AS statusid, j.sourcechannelid AS sourcechannelid, ''::text AS notes
FROM jobrole j
LEFT JOIN contact c ON j.contactid = c.contactid
LEFT JOIN organisation o ON j.companyorgid = o.orgid
WHERE j.applicantid = %s
ORDER BY j.jobid
""",
                    (applicantid,),
                )
                roles = cursor.fetchall()

                join_text = " LEFT JOIN referencedata rd ON rd.refid = e.engagementtypeid "
                type_field = "rd.refvalue AS kind"
                cursor.execute(
                    f"""SELECT e.engagementlogid, e.contactid, c.name AS contact_name, co.name AS company_name,
          e.logdate AS engagedate, e.logentry AS notes, e.engagementtypeid AS engagementtype_refid, {type_field}
FROM engagementlog e
LEFT JOIN contact c ON e.contactid = c.contactid
LEFT JOIN organisation co ON c.currentorgid = co.orgid
{join_text}
WHERE e.applicantid = %s
ORDER BY e.logdate DESC, e.engagementlogid DESC
""",
                    (applicantid,),
                )
                engagements = cursor.fetchall()

                cursor.execute("SELECT * FROM referencedata ORDER BY refid")
                referencedata = cursor.fetchall()
                cursor.execute("SELECT * FROM sector ORDER BY sectorid")
                sectors = cursor.fetchall()

                cto_table = "contacttargetorganisation"
                cursor.execute(
                    f"""SELECT cto.id, cto.contactid, c.name AS contact_name, cto.targetid AS targetid, o.name AS target_org_name, cto.created_at
FROM {cto_table} cto
LEFT JOIN contact c ON cto.contactid = c.contactid
LEFT JOIN organisation o ON cto.targetid = o.orgid
WHERE cto.applicantid = %s
ORDER BY cto.id
""",
                    (applicantid,),
                )
                contact_target_orgs = cursor.fetchall()

                cursor.execute(
                    """SELECT d.documentid, d.documenttypeid, d.documentname, d.documentdescription, d.created_at
FROM document d
WHERE d.applicantid = %s
ORDER BY d.documentid
""",
                    (applicantid,),
                )
                documents = cursor.fetchall()

                cursor.execute(
                    """SELECT ed.engagementdocumentid, ed.engagementlogid, ed.documentid, d.documentname, ed.created_at
FROM engagementdocument ed
LEFT JOIN document d ON ed.documentid = d.documentid
WHERE ed.applicantid = %s
ORDER BY ed.engagementdocumentid
""",
                    (applicantid,),
                )
                engagement_documents = cursor.fetchall()

        data = {
            "contacts": contacts,
            "organisations": organisations,
            "roles": roles,
            "engagements": engagements,
            "referencedata": referencedata,
            "sectors": sectors,
            "contact_target_orgs": contact_target_orgs,
            "documents": documents,
            "engagement_documents": engagement_documents,
        }

        # Explicitly import the workbook builder to avoid relying on globals in app.py
        try:
            from utils.export_utils import build_workbook_from_data

            bio = build_workbook_from_data(data)
        except Exception:
            current_app.logger.exception("Failed to create navigator export document")
            return (jsonify({"error": "Failed to create export"}), 500)

        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                try:
                    cur.execute(
                        "SELECT refid FROM referencedata WHERE lower(refvalue) = lower(%s) LIMIT 1;",
                        ("Excel Download",),
                    )
                    rd_row = cur.fetchone()
                    excel_refid = (
                        jobutils.parse_int(rd_row["refid"], "refid")
                        if rd_row and rd_row.get("refid") is not None
                        else None
                    )
                except Exception:
                    excel_refid = None

                cur.execute(
                    "INSERT INTO document (documentid, documenttypeid, documentname, documentdescription, applicantid, documentcontenttype, documentcontent) VALUES (nextval('public.document_documentid_seq'), %s, %s, %s, %s, %s, %s) RETURNING documentid, documentname, documentdescription, documenttypeid;",
                    (
                        excel_refid,
                        f"export_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.xlsx",
                        "",
                        applicantid,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        psycopg2.Binary(bio.read()),
                    ),
                )
                new = cur.fetchone()
                if new:
                    try:
                        download_uri = f"/api/documents/{new['documentid']}/download"
                        cur.execute(
                            "UPDATE document SET documentdescription = %s WHERE documentid = %s",
                            (download_uri, new["documentid"]),
                        )
                        new["documenturi"] = download_uri
                    except Exception as e:
                        current_app.logger.debug(
                            "Failed to set document download_uri after export insert: %s",
                            e,
                        )

        return (jsonify(new), 201)
    except Exception as e:
        current_app.logger.exception("Failed to create navigator export document: %s", e)
        return (jsonify({"error": "Failed to create export"}), 500)
