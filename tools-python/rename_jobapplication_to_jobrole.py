#!/usr/bin/env python3
"""
Migration helper: rename table JobApplication -> jobrole if needed.
This script reads DB_CONFIG from app.py and performs a safe ALTER TABLE.
Usage: python3 tools/rename_jobapplication_to_jobrole.py
"""
import logging
import sys
from pathlib import Path


# Ensure project root is on sys.path so we can import app.py
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from jobtrack_core.db import query
from jobtrack_core.db_core import get_connection, get_database_name

logging.basicConfig()
logger = logging.getLogger(__name__)


def main():
    print("Using database:", get_database_name())
    try:
        # Use the jobtrack_core.db.query helper for read-only checks to avoid
        # ad-hoc connection management here. For the actual ALTER TABLE we
        # still open a direct connection to perform the write safely.
        rows = query(
            "SELECT table_schema, table_name FROM information_schema.tables WHERE lower(table_name) = 'jobapplication';"
        )
        # Check if target exists
        role_rows = query(
            "SELECT table_schema FROM information_schema.tables WHERE lower(table_name) = 'jobrole';"
        )
        if role_rows:
            print("Target table 'jobrole' already exists — nothing to do.")
            return 0
        if not rows:
            print(
                "No table named JobApplication (case-insensitive) found. Nothing to rename."
            )
            return 0

        # If multiple matches (unlikely), warn and operate on the first
        schema, table = rows[0]
        print(
            f"Found JobApplication as {schema}.{table}. Proceeding to rename to jobrole."
        )

        # Build safe ALTER statement with quoting where necessary
        if table.islower():
            alter_sql = f"ALTER TABLE {schema}.{table} RENAME TO jobrole;"
        else:
            alter_sql = f'ALTER TABLE {schema}."{table}" RENAME TO jobrole;'
        print("Running:", alter_sql)
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(alter_sql)
                conn.commit()
        print("Rename completed successfully.")
        return 0

    except Exception as e:
        logger.exception("Error while renaming JobApplication -> jobrole: %s", e)
        try:
            conn.rollback()
        except Exception:
            logger.exception("Rollback failed")
        return 2
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            logger.exception("Error closing DB resources")


if __name__ == "__main__":
    sys.exit(main())
