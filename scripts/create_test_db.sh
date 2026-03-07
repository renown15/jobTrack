#!/usr/bin/env bash
set -euo pipefail

# Create a local Postgres test database and load the canonical schema.
# Usage:
#   TEST_DATABASE_URL can be set explicitly (optional).
#   Or run with env overrides: PGHOST=localhost PGPORT=5432 PGUSER=postgres DBNAME=jobtrack_test ./scripts/create_test_db.sh

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-$(whoami)}"
DBNAME="${DBNAME:-jobtrack_test}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCHEMA_FILE="$ROOT_DIR/database/schema.sql"

if [ ! -f "$SCHEMA_FILE" ]; then
  echo "Schema file not found: $SCHEMA_FILE"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but not found in PATH. Install Postgres client tools."
  exit 1
fi

if ! command -v createdb >/dev/null 2>&1; then
  echo "createdb is required but not found in PATH. Install Postgres client tools."
  exit 1
fi

echo "Creating database '$DBNAME' on $PGHOST:$PGPORT as user '$PGUSER'..."

# Try creating the DB; if it exists, drop+recreate to ensure a clean state
if createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$DBNAME" 2>/dev/null; then
  echo "Database $DBNAME created."
else
  echo "Database $DBNAME may already exist. Dropping and recreating..."
  dropdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$DBNAME" || true
  createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$DBNAME"
fi

echo "Loading schema from $SCHEMA_FILE..."
# Ensure pgcrypto is available for tests that rely on DB-side encryption
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DBNAME" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" || true

psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DBNAME" -f "$SCHEMA_FILE"

echo "Schema loaded into $DBNAME."

TEST_DB_URL="postgresql://$PGUSER@${PGHOST}:${PGPORT}/${DBNAME}"

echo
echo "To run tests against this database, export the following environment variable in your shell:"
echo
echo "  export TEST_DATABASE_URL='$TEST_DB_URL'"
echo
echo "Then run tests, for example:"
echo
echo "  TEST_DATABASE_URL='$TEST_DB_URL' pytest -q"
echo
echo "If your Postgres server requires a password, set PGPASSWORD in the environment before running this script, e.g."
echo
echo "  export PGPASSWORD='yourpassword'"

exit 0
