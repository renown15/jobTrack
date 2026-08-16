#!/usr/bin/env python3
"""
Idempotent migration to make jobrole.contactid nullable and ensure a
foreign key exists referencing Contact(contactid) with ON DELETE SET NULL.

Run this with the project's venv Python:
  /path/to/venv/bin/python tools/migrate_jobrole_contact_fk.py

It imports DB_CONFIG from app.py, so ensure that file is present and valid.
"""
import sys

from psycopg2.extras import RealDictCursor

try:
    from jobtrack_core.db_core import get_connection
except Exception as e:
    print("Failed to import get_connection from jobtrack_core.db_core:", e)
    sys.exit(1)


def main():
    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Check if jobrole table exists and contactid column exists
            cur.execute(
                """
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_name = 'jobrole' AND column_name = 'contactid'
            """
            )
            row = cur.fetchone()
            if not row:
                print("jobrole.contactid column not found; aborting.")
                return

            is_nullable = row["is_nullable"] == "YES"
            if is_nullable:
                print("jobrole.contactid is already nullable.")
