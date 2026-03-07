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
            else:
                print("Altering jobrole.contactid to be NULLABLE...")
                cur.execute("ALTER TABLE jobrole ALTER COLUMN contactid DROP NOT NULL;")
                print("Done.")

            # Ensure foreign key exists and has ON DELETE SET NULL
            # Find existing FK constraints on jobrole referencing Contact
            cur.execute(
                """
                SELECT conname
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                WHERE t.relname = 'jobrole' AND c.contype = 'f'
            """
            )
            fks = [r["conname"] for r in cur.fetchall()]
            fk_to_contact = None
            for fk in fks:
                # Check referenced table for each constraint
                cur.execute(
                    "SELECT confrelid::regclass::text FROM pg_constraint WHERE conname = %s",
                    (fk,),
                )
                ref = cur.fetchone()
                if (
                    ref
                    and ref.get("confrelid")
                    and ref["confrelid"].lower().startswith("contact")
                ):
                    fk_to_contact = fk
                    break

            if fk_to_contact:
                print(
                    f"Found existing FK {fk_to_contact} on jobrole. Re-creating with ON DELETE SET NULL..."
                )
                # Drop the existing FK
                cur.execute(
                    f'ALTER TABLE jobrole DROP CONSTRAINT IF EXISTS "{fk_to_contact}";'
                )
            else:
                print(
                    "No existing FK referencing Contact found on jobrole; creating one..."
                )

            # Create the FK with a stable name
            cur.execute(
                "ALTER TABLE jobrole ADD CONSTRAINT jobrole_contactid_fkey FOREIGN KEY (contactid) REFERENCES Contact(contactid) ON DELETE SET NULL;"
            )
            print(
                "Foreign key jobrole_contactid_fkey added/ensured with ON DELETE SET NULL."
            )

    print("Migration complete.")


if __name__ == "__main__":
    main()
