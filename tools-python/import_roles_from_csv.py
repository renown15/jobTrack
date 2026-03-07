#!/usr/bin/env python3
"""
Import roles from a CSV into the `jobrole` table, skipping rows that already exist.

Usage:
  ./scripts/import_roles_from_csv.py "/path/to/Recruitment Engagement Tracker jobs.csv"

This script matches existing jobrole rows by (title, company, application_date).
It normalises dates to YYYY-MM-DD when possible.

It uses the project's Database() context manager to perform DB operations.
"""
from __future__ import annotations

import csv
import os
import sys
from datetime import datetime
from typing import Optional

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

from jobtrack_core import db as jobdb


def parse_date(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    s = s.strip()
    # Try common formats
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    # Unknown / human-friendly strings -> return None
    return None


def normalize(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    return s.strip()


def main(path: str, dry_run: bool = False) -> int:
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return 1

    inserted = 0
    skipped = 0

    # open with utf-8-sig to gracefully handle files that include a BOM
    with open(path, newline='', encoding='utf-8-sig') as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)
    # show detected headers so we can debug header-name mismatches
    print('Detected CSV headers:', reader.fieldnames)

    # helper to retrieve a value from a row using multiple possible header names
    def get_field(row: dict, *names: str):
        # direct lookups first
        for n in names:
            if n in row and row[n] not in (None, ''):
                return row[n]
        # fall back to case-insensitive/whitespace-insensitive lookup
        lowered = { (k or '').strip().lower(): v for k, v in row.items() }
        for n in names:
            v = lowered.get(n.strip().lower())
            if v not in (None, ''):
                return v
        return None

    with jobdb.get_conn() as conn:
        with conn.cursor() as cur:
            for r in rows:
                title = normalize(get_field(r, 'Role', 'JobRole', 'role', 'title'))
                company = normalize(get_field(r, 'Company', 'Organisation', 'organisation', 'company'))
                channel = normalize(get_field(r, 'Channel', 'Source', 'channel'))
                app_date_raw = normalize(get_field(r, 'Application Date', 'ApplicationDate', 'application_date', 'App Date'))
                app_date = parse_date(app_date_raw)
                # debug: show resolved title/company/channel and parsed date
                print('row:', {'title': title, 'company': company, 'channel': channel, 'application_date_raw': app_date_raw, 'application_date_parsed': app_date})

                if dry_run:
                    # in dry-run mode we only print parsing results, don't query/insert
                    continue

                if not title:
                    print("Skipping row with empty title")
                    skipped += 1
                    continue

                # Try to resolve organisation name -> orgid (companyorgid)
                orgid = None
                if company:
                    cur.execute("SELECT orgid FROM organisation WHERE lower(name) = lower(%s) LIMIT 1", (company,))
                    orow = cur.fetchone()
                    if orow:
                        orgid = orow.get('orgid') if isinstance(orow, dict) else orow[0]
                    else:
                        # Create organisation if the company value looks reasonable (not just '?')
                        cname = company.strip()
                        if cname and cname not in ('?', 'unknown', 'unkown', 'n/a'):
                            cur.execute("INSERT INTO organisation (name) VALUES (%s) RETURNING orgid", (cname,))
                            new = cur.fetchone()
                            if new:
                                orgid = new.get('orgid') if isinstance(new, dict) else new[0]

                # Check for existing jobrole using schema columns: rolename, companyorgid, applicationdate
                if orgid is not None:
                    cur.execute(
                        """
                        SELECT jobid FROM jobrole
                        WHERE lower(coalesce(rolename, '')) = lower(%s)
                          AND companyorgid = %s
                          AND ( (applicationdate IS NULL AND %s IS NULL) OR applicationdate = %s )
                        LIMIT 1
                        """,
                        (title, orgid, app_date, app_date),
                    )
                else:
                    # no orgid found - match on rolename and NULL companyorgid
                    cur.execute(
                        """
                        SELECT jobid FROM jobrole
                        WHERE lower(coalesce(rolename, '')) = lower(%s)
                          AND companyorgid IS NULL
                          AND ( (applicationdate IS NULL AND %s IS NULL) OR applicationdate = %s )
                        LIMIT 1
                        """,
                        (title, app_date, app_date),
                    )

                found = cur.fetchone()
                if found:
                    skipped += 1
                    continue

                # Insert minimal jobrole row using correct column names
                cur.execute(
                    """
                    INSERT INTO jobrole (rolename, companyorgid, sourcechannel, applicationdate)
                    VALUES (%s, %s, %s, %s)
                    RETURNING jobid
                    """,
                    (title, orgid, channel or None, app_date),
                )
                _ = cur.fetchone()
                inserted += 1

        conn.commit()

    print(f"Inserted: {inserted}, Skipped: {skipped}")
    return 0


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: import_roles_from_csv.py /path/to/file.csv [--dry-run]")
        sys.exit(2)
    csv_path = sys.argv[1]
    dry = '--dry-run' in sys.argv[2:]
    sys.exit(main(csv_path, dry_run=dry))
