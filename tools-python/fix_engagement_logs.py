#!/usr/bin/env python3
"""
fix_engagement_logs.py

Scan existing EngagementLog rows where the LogEntry field contains multiple dated entries
in the form dd/mm (or dd/mm/yyyy) and split them into separate EngagementLog rows with
the correct dates. The original rows are backed up into EngagementLog_backup before
being removed.

Usage:
    python fix_engagement_logs.py [--dry-run] [--limit N]

By default this will modify the database. Use --dry-run to see what would happen.
"""

import argparse
import re
from datetime import date

import psycopg2
import psycopg2.extras

# Reuse the project's DB config - update if necessary
DB_CONFIG = {
    "host": "localhost",
    "database": "jobtrack",
    "user": "marklewis",
    "password": "",
}

DATE_PATTERN = re.compile(r"(\d{1,2}/\d{1,2}(?:/\d{2,4})?)")


def parse_entries_from_log(logtext, default_year=None):
    """Return list of (date_obj, entry_text) parsed from logtext.

    - Looks for occurrences of dd/mm or dd/mm/yyyy and splits text at those markers.
    - If a year is missing, default_year is used (if provided) else current year.
    - Dates are interpreted day-first.
    """
    if not logtext or not isinstance(logtext, str):
        return []

    matches = list(DATE_PATTERN.finditer(logtext))
    if not matches:
        return []

    # If there's only one date marker and the rest is text, keep as single entry
    if len(matches) == 1:
        m = matches[0]
        date_str = m.group(1)
        content = logtext[m.end() :].strip() or ""
        parsed_date = _parse_date_str(date_str, default_year)
        return [(parsed_date, content if content else logtext.strip())]

    entries = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(logtext)
        segment = logtext[start:end].strip()
        # First token is the date
        dm = DATE_PATTERN.match(segment)
        if not dm:
            continue
        date_str = dm.group(1)
        content = segment[dm.end() :].strip(" -:\t\n\r")
        parsed_date = _parse_date_str(date_str, default_year)
        entries.append((parsed_date, content))

    return entries


def _parse_date_str(date_str, default_year=None):
    # Accept dd/mm or dd/mm/yyyy or dd/mm/yy
    parts = date_str.split("/")
    try:
        d = int(parts[0])
        m = int(parts[1])
    except Exception:
        return None

    if len(parts) >= 3 and parts[2]:
        y = int(parts[2])
        if y < 100:  # two-digit year
            y += 2000 if y < 70 else 1900
    else:
        y = default_year or date.today().year

    try:
        return date(y, m, d)
    except Exception:
        return None


def ensure_backup_table(conn):
    cur = conn.cursor()
    cur.execute(
        """
    CREATE TABLE IF NOT EXISTS EngagementLog_backup (
        BackupID SERIAL PRIMARY KEY,
        EngagementLogID INT,
        ContactID INT,
        LogDate DATE,
        LogEntry TEXT,
        BackupTS TIMESTAMP DEFAULT now()
    )
    """
    )
    conn.commit()


def rows_to_fix(conn, limit=None):
    # Select rows where LogEntry contains at least two dd/mm patterns
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    regex = r"([0-3]?\d/[01]?\d).*([0-3]?\d/[01]?\d)"
    sql = "SELECT engagementlogid, contactid, logdate, logentry FROM engagementlog WHERE logentry ~ %s"
    params = (regex,)
    if limit:
        sql += " LIMIT %s"
        params = (regex, limit)
    cur.execute(sql, params)
    return cur.fetchall()


def process(conn, dry_run=False, limit=None):
    ensure_backup_table(conn)
    rows = rows_to_fix(conn, limit=limit)
    print(
        f"Found {len(rows)} engagement log rows that look like they contain multiple dated entries."
    )

    cur = conn.cursor()
    processed = 0
    for row in rows:
        eid = row["engagementlogid"]
        cid = row["contactid"]
        logdate = row["logdate"]
        logentry = row["logentry"] or ""

        default_year = logdate.year if logdate else None
        entries = parse_entries_from_log(logentry, default_year=default_year)

        if len(entries) <= 1:
            print(f"Skipping {eid} (only {len(entries)} parsed entries)")
            continue

        print(
            f"Processing EngagementLogID={eid}, ContactID={cid}, parsed {len(entries)} entries"
        )

        if dry_run:
            for d, txt in entries:
                print(f"  -> {d} : {txt[:80]!r}")
            continue

        # Backup original
        cur.execute(
            "INSERT INTO EngagementLog_backup (EngagementLogID, ContactID, LogDate, LogEntry) VALUES (%s, %s, %s, %s)",
            (eid, cid, logdate, logentry),
        )

        # Insert parsed entries
        for d, txt in entries:
            cur.execute(
                "INSERT INTO EngagementLog (ContactID, LogDate, LogEntry) VALUES (%s, %s, %s)",
                (cid, d, txt),
            )

        # Remove the original row
        cur.execute("DELETE FROM EngagementLog WHERE engagementlogid = %s", (eid,))

        conn.commit()
        processed += 1

    print(f"Completed. Rows processed: {processed}")


def main():
    parser = argparse.ArgumentParser(
        description="Fix EngagementLog rows that have multiple dated entries in LogEntry"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be changed without modifying the DB",
    )
    parser.add_argument("--limit", type=int, help="Limit number of rows to process")
    args = parser.parse_args()

    conn = psycopg2.connect(**DB_CONFIG)
    try:
        process(conn, dry_run=args.dry_run, limit=args.limit)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
