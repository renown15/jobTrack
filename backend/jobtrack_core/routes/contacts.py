from flask import Blueprint, jsonify, request, current_app
import psycopg2
from jobtrack_core import db as jobdb
from typing import Any
from jobtrack_core.request_utils import require_applicant_allowed

api = Blueprint("contacts", __name__)


def _contacttarget_table_name(conn):
    """Detect contact-target table name; fallback to legacy name."""
    try:
        with conn.cursor() as _:
            return "public.contacttargetorganisation"
    except Exception:
        return "public.contacttargetorganisation"


@api.route("/api/<int:applicantid>/contacts", methods=["GET"])
def get_contacts(applicantid):
    """
    Retrieves a list of all contacts (and their current organization name)
    from the Contact and Organisation tables.
    """
    # Clean implementation: build query with group-aware aggregation
    try:
        applicantid = int(applicantid)
    except Exception:
        return (jsonify({"error": "Invalid applicantid"}), 400)

    role_expr = "rd.refvalue AS role_type"
    # join for role type (keep status lookup as a safe subselect to avoid join side-effects)
    rd_join = "LEFT JOIN referencedata rd ON c.roletypeid = rd.refid"

    role_type_id = request.args.get("role_type_id")
    from_date = request.args.get("from_date")
    to_date = request.args.get("to_date")
    org_id = request.args.get("org_id")

    where_clauses = ["c.applicantid = %s"]
    params: list[Any] = [applicantid]

    if role_type_id is not None and str(role_type_id).strip() != "":
        try:
            rtid = int(role_type_id)
            where_clauses.append("c.roletypeid = %s")
            params.append(rtid)
        except Exception as e:
            current_app.logger.debug("Ignored parse error (role_type_id): %s", e)

    extra_select = ""
    if org_id is not None and str(org_id).strip() != "":
        try:
            oid = int(org_id)
            where_clauses.append(
                "(c.currentorgid = %s OR c.contactid IN (SELECT contactid FROM public.contacttargetorganisation WHERE targetid = %s))"
            )
            params.append(oid)
            params.append(oid)
            extra_select = " , (SELECT EXISTS(SELECT 1 FROM public.contacttargetorganisation ct WHERE ct.contactid = c.contactid AND ct.targetid = %s)) AS is_targeting"
            params.append(oid)
        except Exception as e:
            current_app.logger.debug("Ignored parse error (org_id): %s", e)

    where_text = " WHERE " + " AND ".join(where_clauses)

    limit = request.args.get("limit")
    offset = request.args.get("offset")
    limit_clause = ""
    if limit is not None:
        try:
            limit_n = int(limit)
            if limit_n > 0:
                limit_clause = f" LIMIT {limit_n}"
        except Exception as e:
            current_app.logger.debug("Ignored parse error (limit): %s", e)
    if offset is not None:
        try:
            o = int(offset)
            if o >= 0:
                limit_clause += f" OFFSET {o}"
        except Exception as e:
            current_app.logger.debug("Ignored parse error (offset): %s", e)

    engagement_date_clause = ""
    if from_date:
        engagement_date_clause += " AND (e.logdate >= %s)"
        params.append(from_date)
    if to_date:
        engagement_date_clause += " AND (e.logdate <= %s)"
        params.append(to_date)

    # We'll detect optional tables and build extra CTEs accordingly (jobrole dates, document dates, task dates)
    try:
        with jobdb.get_conn() as conn:
            # helper to check table/column existence
            def table_exists(tbl_name):
                with conn.cursor() as _cur:
                    _cur.execute(
                        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = %s)",
                        (tbl_name,),
                    )
                    _res = _cur.fetchone()
                    return bool(_res[0]) if _res else False

            def column_exists(tbl_name, col_name):
                with conn.cursor() as _cur:
                    _cur.execute(
                        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = %s AND column_name = %s)",
                        (tbl_name, col_name),
                    )
                    _res = _cur.fetchone()
                    return bool(_res[0]) if _res else False

            has_jobrole = table_exists("jobrole")
            has_engagementdocument = table_exists("engagementdocument")
            has_roledocument = table_exists("roledocument")
            has_task = table_exists("task")

            # Build optional CTEs
            jobrole_dates_cte = ""
            if has_jobrole and column_exists("jobrole", "applicationdate"):
                jobrole_dates_cte = """,
    jobrole_agg AS (
        SELECT j.contactid, MAX(j.applicationdate) AS last_jobrole_date
        FROM jobrole j
        WHERE j.contactid = ANY (SELECT contactid FROM page)
        GROUP BY j.contactid
    )
"""

            documents_date_cte = ""
            if has_engagementdocument:
                # derive latest document date per contact via engagementdocument -> engagementlog
                documents_date_cte = """,
    documents_date_agg AS (
        SELECT engs.contactid, MAX(ed.created_at::date) AS last_document_date
        FROM (
            SELECT e.engagementlogid, e.contactid AS eng_contact, e.contactid AS contactid
            FROM engagementlog e
            WHERE e.contactid = ANY (SELECT contactid FROM page)
              AND (e.contacttypeid IS NULL OR e.contacttypeid = (
                  SELECT refid FROM referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower('Individual Contact') LIMIT 1
              ))
            UNION ALL
            SELECT e.engagementlogid, e.contactid AS eng_contact, gm.contactid AS contactid
            FROM engagementlog e
            JOIN group_members gm ON gm.contactgroupid = e.contactid
            WHERE e.contacttypeid = (
                SELECT refid FROM referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower('Contact Group') LIMIT 1
            )
        ) engs
        JOIN engagementdocument ed ON ed.engagementlogid = engs.engagementlogid
        GROUP BY engs.contactid
    )
"""

            roledoc_date_cte = ""
            if (
                has_roledocument
                and has_jobrole
                and column_exists("roledocument", "created_at")
            ):
                roledoc_date_cte = """,
    roledoc_date_agg AS (
        SELECT jr.contactid, MAX(rd.created_at::date) AS last_roledoc_date
        FROM jobrole jr
        JOIN roledocument rd ON rd.jobroleid = jr.jobid
        WHERE jr.contactid = ANY (SELECT contactid FROM page)
        GROUP BY jr.contactid
    )
"""

            task_date_cte = ""
            if has_task:
                # prefer updated_at then created_at
                col = None
                if column_exists("task", "updated_at"):
                    col = "updated_at"
                elif column_exists("task", "created_at"):
                    col = "created_at"
                if col:
                    # If the task table has a direct contactid column, use it.
                    if column_exists("task", "contactid"):
                        task_date_cte = f""",
    task_date_agg AS (
        SELECT t.contactid, MAX(t.{col}::date) AS last_task_date
        FROM task t
        WHERE t.contactid = ANY (SELECT contactid FROM page)
        GROUP BY t.contactid
    )
"""
                    # Otherwise, fall back to tasktarget mapping (polymorphic targets)
                    # and attribute tasks to contacts via tasktarget.targetid.
                    elif (
                        table_exists("tasktarget")
                        and column_exists("tasktarget", "targetid")
                        and column_exists("tasktarget", "targettype")
                    ):
                        task_date_cte = f""",
    task_date_agg AS (
        SELECT tt.targetid AS contactid, MAX(t.{col}::date) AS last_task_date
        FROM task t
        JOIN tasktarget tt ON tt.taskid = t.taskid
                WHERE tt.targetid = ANY (SELECT contactid FROM page)
                      AND tt.targettype = (
                          SELECT refid FROM referencedata WHERE refdataclass = 'action_plan_target_type' AND lower(refvalue) LIKE 'contact%%' LIMIT 1
                      )
        GROUP BY tt.targetid
    )
"""
                        # No additional params required (CTE uses no external placeholders)

            # Build the main SQL with optional CTE fragments
            sql = f"""
    WITH page AS (
        SELECT c.contactid
        FROM contact c
        {where_text}
        ORDER BY c.name ASC
        {limit_clause}
    ),
    -- members of groups that include page contacts
    group_members AS (
        SELECT cgm.contactid, cgm.contactgroupid
        FROM contactgroupmembers cgm
        WHERE cgm.contactid = ANY (SELECT contactid FROM page)
    ),
    -- engagements directly assigned to page contacts (or with no contacttype)
    engagement_indiv AS (
        SELECT e.contactid AS target_contactid,
               COUNT(*) AS cnt,
               MIN(e.logdate) AS first_contact_date,
               MAX(e.logdate) AS last_contact_date
        FROM engagementlog e
        WHERE e.contactid = ANY (SELECT contactid FROM page)
          AND (e.contacttypeid IS NULL OR e.contacttypeid = (
              SELECT refid FROM referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower('Individual Contact') LIMIT 1
          ))
          {engagement_date_clause}
        GROUP BY e.contactid
    ),
    -- engagements that reference a contactgroup: attribute to each member
    engagement_group AS (
        SELECT gm.contactid AS target_contactid,
               COUNT(e.engagementlogid) AS cnt,
               MIN(e.logdate) AS first_contact_date,
               MAX(e.logdate) AS last_contact_date
        FROM engagementlog e
        JOIN group_members gm ON gm.contactgroupid = e.contactid
        WHERE e.contacttypeid = (
            SELECT refid FROM referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower('Contact Group') LIMIT 1
        )
        {engagement_date_clause}
        GROUP BY gm.contactid
    ),
    engagement_agg AS (
        SELECT target_contactid AS contactid,
               SUM(cnt) AS engagement_count,
               MIN(first_contact_date) AS first_contact_date,
               MAX(last_contact_date) AS last_contact_date
        FROM (
            SELECT * FROM engagement_indiv
            UNION ALL
            SELECT * FROM engagement_group
        ) t
        GROUP BY target_contactid
    ),
    documents_agg AS (
        SELECT contactid, COUNT(*) AS documents_count
        FROM (
            SELECT e.engagementlogid, e.contactid AS eng_contact, e.contactid AS contactid
            FROM engagementlog e
            WHERE e.contactid = ANY (SELECT contactid FROM page)
              AND (e.contacttypeid IS NULL OR e.contacttypeid = (
                  SELECT refid FROM referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower('Individual Contact') LIMIT 1
              ))
            UNION ALL
            SELECT e.engagementlogid, e.contactid AS eng_contact, gm.contactid AS contactid
            FROM engagementlog e
            JOIN group_members gm ON gm.contactgroupid = e.contactid
            WHERE e.contacttypeid = (
                SELECT refid FROM referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower('Contact Group') LIMIT 1
            )
        ) engs
        JOIN engagementdocument ed ON ed.engagementlogid = engs.engagementlogid
        GROUP BY contactid
    ),
    roles_agg AS (
        SELECT j.contactid, COUNT(*) AS roles_count
        FROM jobrole j
        WHERE j.contactid = ANY (SELECT contactid FROM page)
        GROUP BY j.contactid
    )
    {jobrole_dates_cte}
    {documents_date_cte}
    {roledoc_date_cte}
    {task_date_cte}
    SELECT
        c.contactid,
        c.leadid,
        c.islinkedinconnected,
        c.name,
        c.currentorgid,
        c.currentrole,
        c.created_at,
        c.updated_at,
        c.roletypeid AS role_type_id,
        -- Expose only a single legacy string field `contact_status` for UI compatibility.
        (SELECT refvalue FROM referencedata WHERE refid = c.statusid) AS contact_status,
        {role_expr},
        o.name AS current_organization,
        s.summary AS current_org_sector,
        COALESCE(engagement_agg.engagement_count, 0) AS engagement_count,
        COALESCE(roles_agg.roles_count, 0) AS roles_count,
        COALESCE(documents_agg.documents_count, 0) AS documents_count{extra_select},
                                engagement_agg.first_contact_date,
                                engagement_agg.last_contact_date AS last_engagement_date
    FROM page p
    JOIN contact c ON c.contactid = p.contactid
    LEFT JOIN engagement_agg ON engagement_agg.contactid = c.contactid
    LEFT JOIN roles_agg ON roles_agg.contactid = c.contactid
    LEFT JOIN documents_agg ON documents_agg.contactid = c.contactid
    LEFT JOIN organisation o ON c.currentorgid = o.orgid
    LEFT JOIN sector s ON o.sectorid = s.sectorid
    {rd_join}
        __JOBROLE_JOIN__
        __DOCUMENTS_DATE_JOIN__
        __ROLEDOC_JOIN__
        __TASK_JOIN__
    ORDER BY engagement_agg.last_contact_date DESC NULLS LAST, c.name ASC;
            """

            # Build conditional join fragments so we don't reference absent CTEs
            jobrole_join = (
                "LEFT JOIN jobrole_agg ON jobrole_agg.contactid = c.contactid"
                if jobrole_dates_cte
                else ""
            )
            documents_date_join = (
                "LEFT JOIN documents_date_agg ON documents_date_agg.contactid = c.contactid"
                if documents_date_cte
                else ""
            )
            roledoc_join = (
                "LEFT JOIN roledoc_date_agg ON roledoc_date_agg.contactid = c.contactid"
                if roledoc_date_cte
                else ""
            )
            task_join = (
                "LEFT JOIN task_date_agg ON task_date_agg.contactid = c.contactid"
                if task_date_cte
                else ""
            )

            # Inject join fragments into the SQL (replace simple markers)
            sql = sql.replace("__JOBROLE_JOIN__", jobrole_join)
            sql = sql.replace("__DOCUMENTS_DATE_JOIN__", documents_date_join)
            sql = sql.replace("__ROLEDOC_JOIN__", roledoc_join)
            sql = sql.replace("__TASK_JOIN__", task_join)

            # Ensure date parameters are repeated for every occurrence of the date clause
            if engagement_date_clause:
                occ = sql.count(engagement_date_clause)
                # we already appended dates once above; append for remaining occurrences
                for _ in range(max(0, occ - 1)):
                    if from_date:
                        params.append(from_date)
                    if to_date:
                        params.append(to_date)

            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
                # Debug: SQL logging removed to avoid verbose SQL output in logs
                # Quick diagnostic: count contacts matching applicantid to detect DB state
                try:
                    cnt_sql = "SELECT COUNT(*) AS cnt FROM contact WHERE applicantid = %s"
                    current_app.logger.debug("contacts count SQL: %s", cnt_sql)
                    cursor.execute(cnt_sql, (applicantid,))
                    cnt_row = cursor.fetchone()
                    current_app.logger.debug("contacts matching applicant %s: %s", applicantid, cnt_row and cnt_row.get("cnt"))
                except Exception:
                    current_app.logger.exception("Failed to run quick contact count diagnostic")
                cursor.execute(sql, tuple(params) if params else None)
                contacts = cursor.fetchall()
    except psycopg2.Error as e:
        current_app.logger.error(f"PostgreSQL Error: {e}")
        return (jsonify({"error": "Database error retrieving contacts."}), 500)
    except Exception as e:
        current_app.logger.error(f"General Error: {e}")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)

    # Normalize date fields to ISO strings
    for contact in contacts:
        if contact.get("first_contact_date"):
            try:
                contact["first_contact_date"] = contact["first_contact_date"].strftime(
                    "%Y-%m-%d"
                )
            except Exception:
                contact["first_contact_date"] = str(contact["first_contact_date"])
        # normalize last_engagement_date (engagements only)
        if contact.get("last_engagement_date"):
            try:
                contact["last_engagement_date"] = contact[
                    "last_engagement_date"
                ].strftime("%Y-%m-%d")
            except Exception:
                contact["last_engagement_date"] = str(contact["last_engagement_date"])
            # Keep legacy key `last_contact_date` mapped to engagement last date
            try:
                contact["last_contact_date"] = contact["last_engagement_date"]
            except Exception:
                contact["last_contact_date"] = contact.get("last_engagement_date")

        # (last_activity_date removed) -- no aggregated last-activity computation
        if contact.get("created_at"):
            try:
                # Preserve full ISO datetime including time component for created_at
                contact["created_at"] = contact["created_at"].isoformat()
            except Exception:
                contact["created_at"] = str(contact["created_at"])
        if contact.get("updated_at"):
            try:
                # Preserve full ISO datetime including time component for updated_at
                contact["updated_at"] = contact["updated_at"].isoformat()
            except Exception:
                contact["updated_at"] = str(contact["updated_at"])

    return jsonify(contacts)


@api.route(
    "/api/<int:applicantid>/analytics/top_contacts_by_engagements", methods=["GET"]
)
def top_contacts_by_engagements(applicantid):
    """Return top contacts ordered by engagement count for the applicant."""
    try:
        applicantid = int(applicantid)
    except Exception:
        return (jsonify({"error": "Invalid applicantid"}), 400)
    guard = require_applicant_allowed(applicantid)
    if guard:
        return guard
    limit = int(request.args.get("limit") or 10)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
                cursor.execute(
                    """
                      SELECT c.contactid,
                          COALESCE(NULLIF(c.name, ''), '') AS name,
                          o.name AS organisation,
                          COUNT(e.engagementlogid) AS engagement_count,
                          MAX(e.logdate) AS last_engagement
                      FROM contact c
                      LEFT JOIN engagementlog e ON (
                       (e.contactid = c.contactid)
                       OR (e.contactid IN (SELECT contactgroupid FROM contactgroupmembers WHERE contactid = c.contactid))
                      ) AND e.applicantid = %s
                      LEFT JOIN organisation o ON c.currentorgid = o.orgid
                      WHERE c.applicantid = %s
                      GROUP BY c.contactid, c.name, o.name
                      ORDER BY engagement_count DESC, last_engagement DESC
                      LIMIT %s
                    """,
                    (applicantid, applicantid, limit),
                )
                rows = cursor.fetchall()
        result = [
            {
                "contactid": r["contactid"],
                "name": (r.get("name") or "").strip(),
                "organisation": r.get("organisation"),
                "engagement_count": int(r.get("engagement_count") or 0),
                "last_engagement": (
                    r["last_engagement"].strftime("%Y-%m-%d")
                    if r.get("last_engagement")
                    else None
                ),
            }
            for r in rows
        ]
        return jsonify(result)
    except psycopg2.Error:
        current_app.logger.exception(
            "PostgreSQL Error fetching top_contacts_by_engagements"
        )
        return (jsonify({"error": "Database error retrieving analytics."}), 500)
    except Exception:
        current_app.logger.exception("Error fetching top_contacts_by_engagements")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)


@api.route("/api/<int:applicantid>/analytics/top_recent_contacts", methods=["GET"])
def top_recent_contacts(applicantid):
    """Return most recently active contacts (by last engagement) for the applicant."""
    try:
        applicantid = int(applicantid)
    except Exception:
        return (jsonify({"error": "Invalid applicantid"}), 400)
    guard = require_applicant_allowed(applicantid)
    if guard:
        return guard
    limit = int(request.args.get("limit") or 10)
    try:
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=jobdb.RealDictCursor) as cursor:
                cursor.execute(
                    """
                      SELECT c.contactid,
                          COALESCE(NULLIF(c.name, ''), '') AS name,
                          o.name AS organisation,
                          MAX(e.logdate) AS last_engagement
                      FROM contact c
                      LEFT JOIN engagementlog e ON (
                       (e.contactid = c.contactid)
                       OR (e.contactid IN (SELECT contactgroupid FROM contactgroupmembers WHERE contactid = c.contactid))
                      ) AND e.applicantid = %s
                      LEFT JOIN organisation o ON c.currentorgid = o.orgid
                      WHERE c.applicantid = %s
                      GROUP BY c.contactid, c.name, o.name
                      HAVING MAX(e.logdate) IS NOT NULL
                      ORDER BY last_engagement DESC
                      LIMIT %s
                    """,
                    (applicantid, applicantid, limit),
                )
                rows = cursor.fetchall()
        result = [
            {
                "contactid": r["contactid"],
                "name": (r.get("name") or "").strip(),
                "organisation": r.get("organisation"),
                "last_engagement": (
                    r["last_engagement"].strftime("%Y-%m-%d")
                    if r.get("last_engagement")
                    else None
                ),
            }
            for r in rows
        ]
        return jsonify(result)
    except psycopg2.Error:
        current_app.logger.exception("PostgreSQL Error fetching top_recent_contacts")
        return (jsonify({"error": "Database error retrieving analytics."}), 500)
    except Exception:
        current_app.logger.exception("Error fetching top_recent_contacts")
        return (jsonify({"error": "An unexpected server error occurred."}), 500)
