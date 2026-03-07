#!/usr/bin/env python3
"""
Database Migration Manager for JobTrack

This script manages database migrations, tracking which migrations have been applied
and providing tools to apply new migrations safely.

Usage:
    python migrate.py status          # Show current migration status
    python migrate.py up             # Apply all pending migrations
    python migrate.py up [number]    # Apply migrations up to specific number
    python migrate.py down [number]  # Rollback to specific migration
    python migrate.py create [name]  # Create a new migration file
"""

import glob
import os
import re
import sys
from datetime import datetime

import psycopg2

# Database configuration (matches app.py)
DB_CONFIG = {
    "host": "localhost",
    "database": "jobtrack",
    "user": "marklewis",
    "password": "",
}


def get_db_connection():
    """Get database connection"""
    return psycopg2.connect(**DB_CONFIG)


def ensure_migration_table():
    """Create migrations tracking table if it doesn't exist"""
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    filename VARCHAR(255) NOT NULL
                )
            """
            )
            conn.commit()


def get_applied_migrations():
    """Get list of applied migration numbers"""
    ensure_migration_table()
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT version FROM schema_migrations ORDER BY version")
            return [row[0] for row in cursor.fetchall()]


def get_available_migrations():
    """Get list of available migration files"""
    # Get the script directory and navigate to database/migrations
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    migrations_dir = os.path.join(project_root, "database", "migrations")

    files = glob.glob(os.path.join(migrations_dir, "*.sql"))
    migrations = []

    for file in files:
        filename = os.path.basename(file)
        match = re.match(r"^(\d+)_(.+)\.sql$", filename)
        if match:
            version = int(match.group(1))
            name = match.group(2)
            migrations.append(
                {"version": version, "name": name, "filename": filename, "path": file}
            )

    return sorted(migrations, key=lambda x: x["version"])


def apply_migration(migration):
    """Apply a single migration"""
    print(f"Applying migration {migration['version']}: {migration['name']}")

    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            # Read and execute migration file
            with open(migration["path"], "r") as f:
                migration_sql = f.read()

            try:
                cursor.execute(migration_sql)

                # Record migration as applied
                cursor.execute(
                    "INSERT INTO schema_migrations (version, filename) VALUES (%s, %s)",
                    (migration["version"], migration["filename"]),
                )

                conn.commit()
                print(f"✅ Migration {migration['version']} applied successfully")

            except Exception as e:
                conn.rollback()
                print(f"❌ Error applying migration {migration['version']}: {e}")
                raise


def migration_status():
    """Show current migration status"""
    applied = get_applied_migrations()
    available = get_available_migrations()

    print("Migration Status:")
    print("================")

    for migration in available:
        version = migration["version"]
        status = "✅ APPLIED" if version in applied else "⏳ PENDING"
        print(f"{version:03d} {migration['name']:<30} {status}")

    pending_count = len([m for m in available if m["version"] not in applied])
    print(f"""Applied: {len(applied)}, Pending: {pending_count}""")


def migrate_up(target_version=None):
    """Apply migrations up to target version (or all if None)"""
    applied = get_applied_migrations()
    available = get_available_migrations()

    pending = [m for m in available if m["version"] not in applied]

    if target_version:
        pending = [m for m in pending if m["version"] <= target_version]

    if not pending:
        print("No pending migrations to apply")
        return

    print(f"Applying {len(pending)} migration(s)...")

    for migration in pending:
        apply_migration(migration)

    print("✅ All migrations applied successfully")


def create_migration(name):
    """Create a new migration file"""
    if not name:
        print("❌ Migration name is required")
        return

    # Get next version number
    available = get_available_migrations()
    next_version = max([m["version"] for m in available], default=0) + 1

    # Clean up name
    clean_name = re.sub(r"[^a-zA-Z0-9_]", "_", name.lower())
    filename = f"{next_version:03d}_{clean_name}.sql"

    # Get migrations directory relative to script location
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    migrations_dir = os.path.join(project_root, "database", "migrations")
    filepath = os.path.join(migrations_dir, filename)

    # Create migration template
    template = f"""-- Migration {next_version:03d}: {name}
-- Created: {datetime.now().strftime('%Y-%m-%d')}
-- Description: {name}

-- Add your migration SQL here
-- Example:
-- ALTER TABLE contact ADD COLUMN new_field VARCHAR(255);

-- Remember to update the schema.sql file if this changes the base schema
"""

    with open(filepath, "w") as f:
        f.write(template)

    print(f"✅ Created migration: {filename}")
    print(f"📝 Edit: {filepath}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    command = sys.argv[1]

    try:
        if command == "status":
            migration_status()
        elif command == "up":
            target = int(sys.argv[2]) if len(sys.argv) > 2 else None
            migrate_up(target)
        elif command == "create":
            name = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else None
            create_migration(name)
        else:
            print(f"Unknown command: {command}")
            print(__doc__)

    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
