#!/usr/bin/env bash
set -euo pipefail

# Wrapper script to create the test database, seed it, and run the test suite.
# Usage:
#   Optionally set environment variables to override connection values:
#     PGHOST PGPORT PGUSER DBNAME PGPASSWORD
#   Then run:
#     ./scripts/build_seed_and_test.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-$(whoami)}"
DBNAME="${DBNAME:-jobtrack_test}"

export PGHOST PGPORT PGUSER DBNAME

echo "[uber-script] Using PGHOST=$PGHOST PGPORT=$PGPORT PGUSER=$PGUSER DBNAME=$DBNAME"

echo "[uber-script] Creating test database and loading schema..."
"$ROOT_DIR/scripts/create_test_db.sh"

TEST_DATABASE_URL="postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${DBNAME}"
export TEST_DATABASE_URL

# Create navigator AI DB if schema file exists (helps navigator integration tests)
NAV_SCHEMA="$ROOT_DIR/database/jobtrack_navigator_ai_schema.sql"
if [ -f "$NAV_SCHEMA" ]; then
  NAV_DB="jobtrack_navigator_ai"
  echo "Creating navigator DB $NAV_DB and loading schema..."
  if createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$NAV_DB" 2>/dev/null; then
    echo "Navigator DB $NAV_DB created."
  else
    echo "Navigator DB $NAV_DB may already exist. Dropping and recreating..."
    dropdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$NAV_DB" || true
    createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$NAV_DB"
  fi
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$NAV_DB" -f "$NAV_SCHEMA" || true
fi

SEED_SQL="$ROOT_DIR/database/prime_test_db.sql"
if [ -f "$SEED_SQL" ]; then
  echo "[uber-script] Seeding test database from $SEED_SQL"
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DBNAME" -f "$SEED_SQL"
else
  echo "[uber-script] Warning: seed file not found: $SEED_SQL (skipping)"
fi

echo "[uber-script] Running test runner with TEST_DATABASE_URL=$TEST_DATABASE_URL"
TEST_DATABASE_URL="$TEST_DATABASE_URL" "$ROOT_DIR/scripts/run-tests.sh"

echo "[uber-script] Completed."

exit 0
