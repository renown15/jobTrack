#!/usr/bin/env python3
"""
Migration helper: rename table JobApplication -> jobrole if needed.
This script reads DB_CONFIG from app.py and performs a safe ALTER TABLE.
Usage: python3 tools/rename_jobapplication_to_jobrole.py
"""
import sys
from pathlib import Path

import psycopg2

# Ensure project root is on sys.path so we can import app.py
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from jobtrack_core.db_core import get_connection, get_database_name


def main():
    print("Using database:", get_database_name())
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Check if target exists
        cur.execute(
            "SELECT table_schema FROM information_schema.tables WHERE lower(table_name) = 'jobrole';"
        )
        if cur.fetchone():
            print("Target table 'jobrole' already exists — nothing to do.")
            return 0

        # Find JobApplication table (case-insensitive)
        cur.execute(
            "SELECT table_schema, table_name FROM information_schema.tables WHERE lower(table_name) = 'jobapplication';"
        )
        rows = cur.fetchall()

        if not rows:
            print("No JobApplication table found — nothing to do.")
            return 0

        # Multiple matches are unexpected; abort conservatively so operator can inspect
        if len(rows) > 1:
            print("Multiple JobApplication tables found; aborting to avoid accidental rename.")
            return 2

        # Perform a safe ALTER TABLE ... RENAME TO jobrole in the discovered schema
        schema, table = rows[0]
        qualified = f'"{schema}"."{table}"'
        print(f"Renaming {qualified} -> {schema}.jobrole")
        cur.execute(f"ALTER TABLE {qualified} RENAME TO jobrole;")
        conn.commit()
        print("Rename complete.")
        cur.close()
        conn.close()
        return 0
