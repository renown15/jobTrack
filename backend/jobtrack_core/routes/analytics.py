from flask import Blueprint, jsonify, request, current_app
from flask.typing import ResponseReturnValue
import os
from typing import Any
from jobtrack_core import jobutils
from jobtrack_core import db as jobdb
from psycopg2.extras import RealDictCursor
from jobtrack_core.request_utils import require_applicant_allowed
from jobtrack_core.routes.contacts import _contacttarget_table_name

api = Blueprint("analytics", __name__)


@api.route("/api/<int:applicantid>/analytics/summary", methods=["GET"])
def get_analytics_summary(applicantid) -> ResponseReturnValue:
    """
    Returns comprehensive analytics data for the dashboard.
    Supports date range filtering via query params: start_date, end_date (YYYY-MM-DD format).

    Returns:
    - organizationsBySector: Bubble chart data with contacts, engagements, interviews per sector/org
    - contactsBySector: Pie chart showing contact distribution across sectors
    - cumulativeContacts: Running total of contacts by month
    - cumulativeEngagements: Running total of engagements by month
    - cumulativeInterviews: Running total of interview engagements by month
    - summary: Key metrics (total contacts, engagements, interviews, conversion rates)
    """
    try:
        start_date = request.args.get("start_date") or request.args.get("from_date")
        end_date = request.args.get("end_date") or request.args.get("to_date")
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                date_filter = ""
                date_params = []
                if start_date and end_date:
                    date_filter = "AND DATE(e.logdate) BETWEEN %s AND %s"
                    date_params = [start_date, end_date]
                cursor.execute(
                    "SELECT refid, refvalue FROM referencedata WHERE lower(refdataclass) = 'application_status';"
                )
                app_status_rows = cursor.fetchall()
                app_status_refids = (
                    [r["refid"] for r in app_status_rows] if app_status_rows else []
                )
                if app_status_refids:
                    active_labels = {"yet to apply", "applied", "interview"}
                    active_refids = [
                        r["refid"]
                        for r in app_status_rows
                        if (r.get("refvalue") or "").strip().lower() in active_labels
                    ]
                    if active_refids:
                        status_case_sql = "COUNT(DISTINCT CASE WHEN j.statusid = ANY(%s) THEN j.jobid END) as active_roles_count"
                        status_param = active_refids
                    else:
                        status_case_sql = "0 as active_roles_count"
                        status_param = None
                else:
                    status_case_sql = "0 as active_roles_count"
                    status_param = None
                query_params: list[Any] = []
                if status_param:
                    query_params.append(status_param)
                query_params.append(applicantid)
                if date_params:
                    query_params.extend(date_params)
                query_params.append(applicantid)
                query_params.append(applicantid)
                engagement_join = "LEFT JOIN engagementlog e ON e.contactid = c.contactid AND e.applicantid = %s"
                if date_params:
                    engagement_join = "LEFT JOIN engagementlog e ON e.contactid = c.contactid AND DATE(e.logdate) BETWEEN %s AND %s AND e.applicantid = %s"
                sql = f"""                    SELECT 
    COALESCE(s.summary, 'Uncategorized') as sector,
    o.name as organization,
    o.orgid,
    COUNT(DISTINCT c.contactid) as contact_count,
    COUNT(DISTINCT e.engagementlogid) as engagement_count,
    COUNT(DISTINCT CASE WHEN r.refvalue = 'Interview' THEN e.engagementlogid END) as interview_count,
    COUNT(DISTINCT j.jobid) as roles_count,
    {status_case_sql}
FROM organisation o
LEFT JOIN sector s ON o.sectorid = s.sectorid
LEFT JOIN contact c ON c.currentorgid = o.orgid AND c.applicantid = %s
{engagement_join}
LEFT JOIN jobrole j ON j.companyorgid = o.orgid AND j.applicantid = %s
LEFT JOIN referencedata r ON e.engagementtypeid = r.refid
LEFT JOIN referencedata rs ON j.statusid = rs.refid
WHERE 1=1
GROUP BY s.summary, o.name, o.orgid
HAVING (COUNT(DISTINCT c.contactid) > 0 OR COUNT(DISTINCT j.jobid) > 0)
ORDER BY s.summary, contact_count DESC
                """
                try:
                    current_app.logger.debug(
                        "Executing orgs_by_sector SQL; params=%s", query_params
                    )
                    cursor.execute(sql, tuple(query_params) if query_params else [])
                except Exception:
                    current_app.logger.exception("Error executing orgs_by_sector SQL")
                    raise
                orgs_by_sector = cursor.fetchall()
                try:
                    rd_col = "rd.refvalue"
                    contact_role_col_ref = "c.roletypeid"
                    role_select = f"COALESCE({rd_col}, 'Unknown')"
                    role_join = f"LEFT JOIN referencedata rd ON {contact_role_col_ref} = rd.refid"
                    cursor.execute(
                        f"""                        SELECT COALESCE(s.summary, 'Uncategorized') AS sector,
       {role_select} AS role_type,
       COUNT(DISTINCT c.contactid) AS cnt
FROM contact c
JOIN organisation o ON c.currentorgid = o.orgid
LEFT JOIN sector s ON o.sectorid = s.sectorid
{role_join}
WHERE c.applicantid = %s
GROUP BY COALESCE(s.summary, 'Uncategorized'), {role_select}
ORDER BY COALESCE(s.summary, 'Uncategorized'), cnt DESC
                    """,
                        (applicantid,),
                    )
                    contacts_by_role = cursor.fetchall()
                except Exception:
                    current_app.logger.exception("Error fetching contacts_by_role")
                    try:
                        conn.rollback()
                    except Exception as e:
                        current_app.logger.debug(
                            "Failed to rollback DB after contacts_by_role error: %s", e
                        )
                    contacts_by_role = []
                try:
                    kind_col = rd_col
                    kind_select = f"COALESCE({kind_col}, 'Unknown')"
                    cursor.execute(
                        f"""                        SELECT COALESCE(s.summary, 'Uncategorized') AS sector,
       {kind_select} AS kind,
       COUNT(e.engagementlogid) AS cnt
FROM engagementlog e
JOIN contact c ON e.contactid = c.contactid
JOIN organisation o ON c.currentorgid = o.orgid
LEFT JOIN sector s ON o.sectorid = s.sectorid
LEFT JOIN referencedata rd ON e.engagementtypeid = rd.refid
WHERE e.logdate IS NOT NULL {(date_filter if date_filter else '')} AND c.applicantid = %s AND e.applicantid = %s
GROUP BY COALESCE(s.summary, 'Uncategorized'), {kind_select}
ORDER BY COALESCE(s.summary, 'Uncategorized'), cnt DESC
                    """,
                        (
                            tuple(date_params + [applicantid, applicantid])
                            if date_params
                            else (applicantid, applicantid)
                        ),
                    )
                    engagements_by_sector_type = cursor.fetchall()
                except Exception:
                    current_app.logger.exception("Error fetching engagements_by_sector_type")
                    try:
                        conn.rollback()
                    except Exception as e:
                        current_app.logger.debug(
                            "Failed to rollback DB after engagements_by_sector_type error: %s",
                            e,
                        )
                    engagements_by_sector_type = []
                try:
                    role_col = rd_col
                    role_select = f"COALESCE({role_col}, 'Unknown')"
                    cursor.execute(
                        f"""                        WITH first_engagement_per_contact AS (
    SELECT contactid, MIN(logdate) AS first_engagement_date
    FROM engagementlog
    WHERE logdate IS NOT NULL AND applicantid = %s
    GROUP BY contactid
),
monthly_contacts_by_role AS (
    SELECT DATE_TRUNC('month', f.first_engagement_date)::date AS month,
           {role_select} AS role_type,
           COUNT(DISTINCT f.contactid) AS new_contacts
    FROM first_engagement_per_contact f
    JOIN contact c ON c.contactid = f.contactid
    LEFT JOIN referencedata rd ON c.roletypeid = rd.refid
    WHERE f.first_engagement_date IS NOT NULL {('AND DATE(f.first_engagement_date) BETWEEN %s AND %s' if date_filter else '')} AND c.applicantid = %s
    GROUP BY DATE_TRUNC('month', f.first_engagement_date)::date, {role_select}
    ORDER BY month
)
SELECT month, role_type, new_contacts,
       SUM(new_contacts) OVER (PARTITION BY role_type ORDER BY month) AS cumulative_total
FROM monthly_contacts_by_role
ORDER BY month, role_type
""",
                        (
                            tuple([applicantid] + date_params + [applicantid])
                            if date_params
                            else (applicantid, applicantid)
                        ),
                    )
                    cumulative_contacts_by_role = cursor.fetchall()
                except Exception:
                    current_app.logger.exception("Error fetching cumulative_contacts_by_role")
                    try:
                        conn.rollback()
                    except Exception as e:
                        current_app.logger.debug(
                            "Failed to rollback DB after cumulative_contacts_by_role error: %s",
                            e,
                        )
                    cumulative_contacts_by_role = []
                try:
                    kind_col = rd_col
                    kind_select = f"COALESCE({kind_col}, 'Unknown')"
                    cursor.execute(
                        f"""                        WITH monthly_engagements_by_kind AS (
    SELECT DATE_TRUNC('month', e.logdate)::date AS month,
           {kind_select} AS kind,
           COUNT(e.engagementlogid) AS new_engagements
    FROM engagementlog e
    LEFT JOIN referencedata rd ON e.engagementtypeid = rd.refid
    WHERE e.logdate IS NOT NULL {('AND DATE(e.logdate) BETWEEN %s AND %s' if date_filter else '')} AND e.applicantid = %s
    GROUP BY DATE_TRUNC('month', e.logdate)::date, {kind_select}
    ORDER BY month
)
SELECT month, kind, new_engagements,
       SUM(new_engagements) OVER (PARTITION BY kind ORDER BY month) AS cumulative_total
FROM monthly_engagements_by_kind
ORDER BY month, kind
                    """,
                        (
                            tuple(date_params + [applicantid])
                            if date_params
                            else (applicantid,)
                        ),
                    )
                    cumulative_engagements_by_kind = cursor.fetchall()
                    try:
                        kind_col = "rd.refvalue"
                        kind_select = f"COALESCE({kind_col}, 'Unknown')"
                        cursor.execute(
                            f"""                            SELECT DATE_TRUNC('month', e.logdate)::date AS month,
       {kind_select} AS kind,
       COUNT(e.engagementlogid) AS cnt
FROM engagementlog e
LEFT JOIN referencedata rd ON e.engagementtypeid = rd.refid
WHERE e.logdate IS NOT NULL {('AND DATE(e.logdate) BETWEEN %s AND %s' if date_filter else '')} AND e.applicantid = %s
GROUP BY DATE_TRUNC('month', e.logdate)::date, {kind_select}
ORDER BY month, kind
                        """,
                            (
                                tuple(date_params + [applicantid])
                                if date_params
                                else (applicantid,)
                            ),
                        )
                        monthly_engagements_by_type = cursor.fetchall()
                    except Exception:
                        current_app.logger.exception(
                            "Error fetching monthly_engagements_by_type"
                        )
                        try:
                            conn.rollback()
                        except Exception as e:
                            current_app.logger.debug(
                                "Failed to rollback DB after monthly_engagements_by_type error: %s",
                                e,
                            )
                        monthly_engagements_by_type = []
                except Exception:
                    current_app.logger.exception(
                        "Error fetching cumulative_engagements_by_kind"
                    )
                    try:
                        conn.rollback()
                    except Exception as e:
                        current_app.logger.debug(
                            "Failed to rollback DB after cumulative_engagements_by_kind error: %s",
                            e,
                        )
                    cumulative_engagements_by_kind = []
                cto_table = _contacttarget_table_name(conn)
                cursor.execute(
                    f"""                    WITH org_contacts AS (
    -- Contacts working at organization (current org)
    SELECT 
        o.orgid,
        o.name as org_name,
        c.contactid,
        'current' as relationship_type
    FROM contact c
    JOIN organisation o ON c.currentorgid = o.orgid
    LEFT JOIN sector s ON o.sectorid = s.sectorid
    WHERE COALESCE(s.summary, '') != 'Recruitment & Executive Search' AND c.applicantid = %s
    
    UNION
    
    -- Contacts targeting organization
    SELECT 
        o.orgid,
        o.name as org_name,
        c.contactid,
        'target' as relationship_type
    FROM {cto_table} cto
    JOIN contact c ON cto.contactid = c.contactid
    JOIN organisation o ON cto.targetid = o.orgid
    LEFT JOIN sector s ON o.sectorid = s.sectorid
    WHERE COALESCE(s.summary, '') != 'Recruitment & Executive Search' AND c.applicantid = %s
)
SELECT 
    org_name,
    COUNT(DISTINCT contactid) as contact_count,
    COUNT(DISTINCT CASE WHEN relationship_type = 'current' THEN contactid END) as current_contacts,
    COUNT(DISTINCT CASE WHEN relationship_type = 'target' THEN contactid END) as target_contacts
FROM org_contacts
GROUP BY orgid, org_name
ORDER BY contact_count DESC
LIMIT 10
                """,
                    (applicantid, applicantid),
                )
                top_hiring_orgs = cursor.fetchall()
                cursor.execute(
                    "SELECT MIN(DATE(logdate)) AS min_date, MAX(DATE(logdate)) AS max_date FROM engagementlog WHERE applicantid = %s",
                    (applicantid,),
                )
                date_range_row = cursor.fetchone() or {}
                available_min_date = date_range_row.get("min_date")
                available_max_date = date_range_row.get("max_date")
                cursor.execute(
                    f"""                    WITH first_engagement_per_contact AS (
    SELECT 
        contactid,
        MIN(logdate) as first_engagement_date
    FROM engagementlog
    WHERE logdate IS NOT NULL AND applicantid = %s
    GROUP BY contactid
),
monthly_contacts AS (
    SELECT 
        DATE_TRUNC('month', first_engagement_date)::date as month,
        COUNT(contactid) as new_contacts
    FROM first_engagement_per_contact
    WHERE first_engagement_date IS NOT NULL
        {('AND DATE(first_engagement_date) BETWEEN %s AND %s' if date_filter else '')}
    GROUP BY DATE_TRUNC('month', first_engagement_date)::date
    ORDER BY month
)
SELECT 
    month,
    new_contacts,
    SUM(new_contacts) OVER (ORDER BY month) as cumulative_total
FROM monthly_contacts
                """,
                    (
                        tuple([applicantid] + date_params)
                        if date_params
                        else (applicantid,)
                    ),
                )
                cumulative_contacts = cursor.fetchall()
                cursor.execute(
                    f"""                    WITH monthly_engagements AS (
    SELECT 
        DATE_TRUNC('month', logdate)::date as month,
        COUNT(engagementlogid) as new_engagements
    FROM engagementlog
    WHERE logdate IS NOT NULL
        {('AND DATE(logdate) BETWEEN %s AND %s' if date_filter else '')} AND applicantid = %s
    GROUP BY DATE_TRUNC('month', logdate)::date
    ORDER BY month
)
SELECT 
    month,
    new_engagements,
    SUM(new_engagements) OVER (ORDER BY month) as cumulative_total
FROM monthly_engagements
                """,
                    (
                        tuple(date_params + [applicantid])
                        if date_params
                        else (applicantid,)
                    ),
                )
                cumulative_engagements = cursor.fetchall()
                cursor.execute(
                    f"""                    WITH monthly_interviews AS (
    SELECT 
        DATE_TRUNC('month', e.logdate)::date as month,
        COUNT(e.engagementlogid) as new_interviews
    FROM engagementlog e
    JOIN referencedata r ON e.engagementtypeid = r.refid
    WHERE e.logdate IS NOT NULL
        AND r.refvalue = 'Interview'
        {('AND DATE(e.logdate) BETWEEN %s AND %s' if date_filter else '')} AND e.applicantid = %s
    GROUP BY DATE_TRUNC('month', e.logdate)::date
    ORDER BY month
)
SELECT 
    month,
    new_interviews,
    SUM(new_interviews) OVER (ORDER BY month) as cumulative_total
FROM monthly_interviews
                """,
                    (
                        tuple(date_params + [applicantid])
                        if date_params
                        else (applicantid,)
                    ),
                )
                cumulative_interviews = cursor.fetchall()
                cursor.execute(
                    f"""                    WITH monthly_applications AS (
    SELECT
        DATE_TRUNC('month', j.applicationdate)::date as month,
        COUNT(j.jobid) as new_applications
    FROM jobrole j
    WHERE j.applicationdate IS NOT NULL
        {('AND DATE(j.applicationdate) BETWEEN %s AND %s' if date_filter else '')} AND j.applicantid = %s
    GROUP BY DATE_TRUNC('month', j.applicationdate)::date
    ORDER BY month
)
SELECT
    month,
    new_applications,
    SUM(new_applications) OVER (ORDER BY month) as cumulative_total
FROM monthly_applications
                """,
                    (
                        tuple(date_params + [applicantid])
                        if date_params
                        else (applicantid,)
                    ),
                )
                cumulative_applications = cursor.fetchall()
                try:
                    source_col = rd_col
                    source_select = f"COALESCE({source_col}, 'Unknown')"
                    cursor.execute(
                        f"""                        WITH monthly_applications_by_source AS (
    SELECT DATE_TRUNC('month', j.applicationdate)::date AS month,
           {source_select} AS source,
           COUNT(j.jobid) AS new_applications
    FROM jobrole j
    LEFT JOIN referencedata rd ON j.sourcechannelid = rd.refid
    WHERE j.applicationdate IS NOT NULL
        {('AND DATE(j.applicationdate) BETWEEN %s AND %s' if date_filter else '')} AND j.applicantid = %s
    GROUP BY DATE_TRUNC('month', j.applicationdate)::date, {source_select}
    ORDER BY month
)
SELECT month, source, new_applications,
       SUM(new_applications) OVER (PARTITION BY source ORDER BY month) AS cumulative_total
FROM monthly_applications_by_source
ORDER BY month, source
                    """,
                        (
                            tuple(date_params + [applicantid])
                            if date_params
                            else (applicantid,)
                        ),
                    )
                    cumulative_applications_by_source = cursor.fetchall()
                except Exception:
                    current_app.logger.exception(
                        "Error fetching cumulative_applications_by_source"
                    )
                    try:
                        conn.rollback()
                    except Exception as e:
                        current_app.logger.debug(
                            "Failed to rollback DB after cumulative_applications_by_source error: %s",
                            e,
                        )
                    cumulative_applications_by_source = []
                try:
                    status_col = "rd.refvalue"
                    status_select = f"COALESCE({status_col}, 'Unknown')"
                    cursor.execute(
                        f"""                        SELECT DATE_TRUNC('month', j.applicationdate)::date AS month,
       {status_select} AS status,
       COUNT(j.jobid) AS cnt
FROM jobrole j
LEFT JOIN referencedata rd ON j.statusid = rd.refid
WHERE j.applicationdate IS NOT NULL
    {('AND DATE(j.applicationdate) BETWEEN %s AND %s' if date_filter else '')} AND j.applicantid = %s
GROUP BY DATE_TRUNC('month', j.applicationdate)::date, {status_select}
ORDER BY month, status
                    """,
                        (
                            tuple(date_params + [applicantid])
                            if date_params
                            else (applicantid,)
                        ),
                    )
                    monthly_roles_by_status = cursor.fetchall()
                except Exception:
                    current_app.logger.exception("Error fetching monthly_roles_by_status")
                    try:
                        conn.rollback()
                    except Exception as e:
                        current_app.logger.debug(
                            "Failed to rollback DB after monthly_roles_by_status error: %s",
                            e,
                        )
                    monthly_roles_by_status = []
                    cursor.execute(
                        f"""                        SELECT 
        COUNT(DISTINCT c.contactid) as total_contacts,
        COUNT(DISTINCT e.engagementlogid) as total_engagements,
        COUNT(DISTINCT CASE WHEN r.refvalue = 'Interview' THEN e.engagementlogid END) as total_interviews,
        COUNT(DISTINCT j.jobid) as total_applications
FROM contact c
LEFT JOIN engagementlog e ON e.contactid = c.contactid
    {('AND DATE(e.logdate) BETWEEN %s AND %s' if date_filter else '')} AND e.applicantid = %s
LEFT JOIN referencedata r ON e.engagementtypeid = r.refid
LEFT JOIN jobrole j ON j.contactid = c.contactid AND j.applicantid = %s
WHERE c.applicantid = %s
                """,
                        (
                            tuple(date_params + [applicantid, applicantid, applicantid])
                            if date_params
                            else (applicantid, applicantid, applicantid)
                        ),
                    )
                summary = cursor.fetchone() or {}
                if not summary:
                    current_app.logger.debug(
                        "analytics summary query returned no rows; treating as zeros"
                    )
                total_contacts = summary.get("total_contacts") or 0
                total_engagements = summary.get("total_engagements") or 0
                total_interviews = summary.get("total_interviews") or 0
                total_applications = summary.get("total_applications") or 0
                engagement_rate = (
                    total_engagements / total_contacts * 100
                    if total_contacts > 0
                    else 0
                )
                interview_rate = (
                    total_interviews / total_engagements * 100
                    if total_engagements > 0
                    else 0
                )
                kind_col = "rd.refvalue"
                kind_select = f"COALESCE({kind_col}, 'Unknown')"
                cursor.execute(
                    f"""                          SELECT {kind_select} AS kind,
          COUNT(e.engagementlogid) AS cnt
      FROM engagementlog e
      LEFT JOIN referencedata rd ON e.engagementtypeid = rd.refid
WHERE e.logdate IS NOT NULL {(date_filter if date_filter else '')} AND e.applicantid = %s
GROUP BY kind
ORDER BY cnt DESC
                """,
                    (
                        tuple(date_params + [applicantid])
                        if date_params
                        else (applicantid,)
                    ),
                )
                engagements_by_type = cursor.fetchall()
                return jsonify(
                    {
                        "organizationsBySector": [
                            {
                                "sector": row["sector"],
                                "name": row["organization"],
                                "orgid": row["orgid"],
                                "contact_count": row["contact_count"],
                                "engagement_count": row["engagement_count"],
                                "interview_count": row["interview_count"],
                                "roles_count": (
                                    row.get("roles_count")
                                    if isinstance(row, dict)
                                    else row[6] if row and len(row) > 6 else 0
                                ),
                                "active_roles": (
                                    row.get("active_roles_count")
                                    if isinstance(row, dict)
                                    else row[7] if row and len(row) > 7 else 0
                                ),
                            }
                            for row in orgs_by_sector
                        ],
                        "contactsByRoleBySector": [
                            {
                                "sector": r["sector"] if isinstance(r, dict) else r[0],
                                "role_type": (
                                    r["role_type"] if isinstance(r, dict) else r[1]
                                ),
                                "count": int(r["cnt"] if isinstance(r, dict) else r[2]),
                            }
                            for r in contacts_by_role
                        ],
                        "engagementsBySectorType": [
                            {
                                "sector": r["sector"] if isinstance(r, dict) else r[0],
                                "kind": r["kind"] if isinstance(r, dict) else r[1],
                                "count": int(r["cnt"] if isinstance(r, dict) else r[2]),
                            }
                            for r in engagements_by_sector_type
                        ],
                        "topHiringOrgs": {
                            "labels": [row["org_name"] for row in top_hiring_orgs],
                            "values": [row["contact_count"] for row in top_hiring_orgs],
                            "details": [
                                {
                                    "name": row["org_name"],
                                    "total": row["contact_count"],
                                    "current": row["current_contacts"],
                                    "target": row["target_contacts"],
                                }
                                for row in top_hiring_orgs
                            ],
                        },
                        "cumulativeContacts": {
                            "labels": [
                                row["month"].strftime("%Y-%m")
                                for row in cumulative_contacts
                            ],
                            "values": [
                                int(row["cumulative_total"])
                                for row in cumulative_contacts
                            ],
                        },
                        "cumulativeContactsByRole": [
                            {
                                "month": r["month"].strftime("%Y-%m"),
                                "role_type": (
                                    r["role_type"] if isinstance(r, dict) else r[1]
                                ),
                                "cumulative_total": int(
                                    r["cumulative_total"]
                                    if isinstance(r, dict)
                                    else r[3]
                                ),
                            }
                            for r in cumulative_contacts_by_role
                        ],
                        "cumulativeEngagementsByType": [
                            {
                                "month": r["month"].strftime("%Y-%m"),
                                "kind": r["kind"] if isinstance(r, dict) else r[1],
                                "cumulative_total": int(
                                    r["cumulative_total"]
                                    if isinstance(r, dict)
                                    else r[3]
                                ),
                            }
                            for r in cumulative_engagements_by_kind
                        ],
                        "cumulativeEngagements": {
                            "labels": [
                                row["month"].strftime("%Y-%m")
                                for row in cumulative_engagements
                            ],
                            "values": [
                                int(row["cumulative_total"])
                                for row in cumulative_engagements
                            ],
                        },
                        "cumulativeInterviews": {
                            "labels": [
                                row["month"].strftime("%Y-%m")
                                for row in cumulative_interviews
                            ],
                            "values": [
                                int(row["cumulative_total"])
                                for row in cumulative_interviews
                            ],
                        },
                        "cumulativeRolesBySource": [
                            {
                                "month": r["month"].strftime("%Y-%m"),
                                "source": r["source"] if isinstance(r, dict) else r[1],
                                "cumulative_total": int(
                                    r["cumulative_total"]
                                    if isinstance(r, dict)
                                    else r[3]
                                ),
                            }
                            for r in cumulative_applications_by_source or []
                        ],
                        "cumulativeRoles": {
                            "labels": [
                                row["month"].strftime("%Y-%m")
                                for row in cumulative_applications
                            ],
                            "values": [
                                int(row["cumulative_total"])
                                for row in cumulative_applications
                            ],
                        },
                        "engagementsByType": [
                            {"kind": r["kind"], "count": int(r["cnt"])}
                            for r in engagements_by_type
                        ],
                        "monthlyEngagementsByType": [
                            {
                                "month": r["month"].strftime("%Y-%m"),
                                "kind": r["kind"] if isinstance(r, dict) else r[1],
                                "count": int(r["cnt"] if isinstance(r, dict) else r[2]),
                            }
                            for r in monthly_engagements_by_type or []
                        ],
                        "monthlyRolesByStatus": [
                            {
                                "month": r["month"].strftime("%Y-%m"),
                                "status": r["status"] if isinstance(r, dict) else r[1],
                                "count": int(r["cnt"] if isinstance(r, dict) else r[2]),
                            }
                            for r in monthly_roles_by_status or []
                        ],
                        "summary": {
                            "totalContacts": total_contacts,
                            "totalEngagements": total_engagements,
                            "totalInterviews": total_interviews,
                            "totalApplications": total_applications,
                            "engagementRate": round(engagement_rate, 1),
                            "interviewRate": round(interview_rate, 1),
                        },
                        "min_date": (
                            available_min_date.strftime("%Y-%m-%d")
                            if available_min_date
                            else None
                        ),
                        "max_date": (
                            available_max_date.strftime("%Y-%m-%d")
                            if available_max_date
                            else None
                        ),
                    }
                )
    except Exception as e:
        current_app.logger.exception("Error fetching analytics summary")
        if (
            os.getenv("DEV_DEBUG", "0") == "1"
            or os.getenv("FLASK_ENV") == "development"
        ):
            import traceback

            tb = traceback.format_exc()
            return (jsonify({"error": str(e), "trace": tb}), 500)
        return (jsonify({"error": "Internal server error"}), 500)


@api.route("/api/<int:applicantid>/analytics/engagements_by_month", methods=["GET"])
def get_engagements_by_month(applicantid) -> ResponseReturnValue:
    from_date = request.args.get("from_date") or request.args.get("start_date")
    to_date = request.args.get("to_date") or request.args.get("end_date")
    params = []
    date_clause = ""
    if from_date and to_date:
        date_clause = "AND DATE(logdate) BETWEEN %s AND %s"
        params = [from_date, to_date]
    try:
        try:
            applicantid = jobutils.parse_int(applicantid, "applicantid")
        except Exception:
            return (jsonify({"error": "Invalid applicantid"}), 400)
        guard = require_applicant_allowed(applicantid)
        if guard:
            return guard
        with jobdb.get_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    f"""                    SELECT DATE_TRUNC('month', logdate)::date AS month, COUNT(engagementlogid) AS cnt
FROM engagementlog
WHERE logdate IS NOT NULL AND applicantid = %s
    {date_clause}
GROUP BY DATE_TRUNC('month', logdate)::date
ORDER BY month
                """,
                    tuple([applicantid] + (params if params else [])),
                )
                rows = cursor.fetchall()
        return jsonify(
            [
                {"month": r["month"].strftime("%Y-%m"), "cnt": int(r["cnt"])}
                for r in rows
            ]
        )
    except Exception as e:
        current_app.logger.error(f"Error fetching engagements_by_month: {e}")
        return (jsonify({"error": str(e)}), 500)
