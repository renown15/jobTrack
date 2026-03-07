#!/usr/bin/env bash
set -euo pipefail

# scripts/setup_jobtrack_db.sh
# Create a local Postgres container named `jobtrack_db`, load the project's
# `database/schema.sql`, and verify the schema. Intended as a reproducible
# template for CI and local development.
#
# Usage:
#   ./scripts/setup_jobtrack_db.sh              # default values
#   ./scripts/setup_jobtrack_db.sh --port 5433 --container-name jobtrack_db --image postgres:15 \
#       --db jobtrack_test --user postgres --pass postgres --schema-file database/schema.sql

PORT=5433
CONTAINER_NAME=jobtrack_db
IMAGE=postgres:15
DB_NAME=jobtrack_test
DB_USER=postgres
DB_PASS=postgres
SCHEMA_FILE="database/schema.sql"
FORCE=0

print_help() {
  sed -n '1,120p' "$0" | sed -n '1,120p'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --container-name) CONTAINER_NAME="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    --db) DB_NAME="$2"; shift 2 ;;
    --user) DB_USER="$2"; shift 2 ;;
    --pass) DB_PASS="$2"; shift 2 ;;
    --schema-file) SCHEMA_FILE="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help) print_help; exit 0 ;;
    *) echo "Unknown arg: $1"; print_help; exit 2 ;;
  esac
done

echo "Setup jobtrack DB"
echo "  container: $CONTAINER_NAME"
echo "  image:     $IMAGE"
echo "  port:      $PORT -> container 5432"
echo "  database:  $DB_NAME"
echo "  user:      $DB_USER"

if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "ERROR: schema file not found: $SCHEMA_FILE"
  exit 1
fi

# If container exists, remove or fail
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  if [[ "$FORCE" -eq 1 ]]; then
    echo "Removing existing container $CONTAINER_NAME"
    docker rm -f "$CONTAINER_NAME"
  else
    echo "Container $CONTAINER_NAME already exists. Use --force to remove it." >&2
    exit 1
  fi
fi

echo "Pulling image $IMAGE (if needed)"
docker pull "$IMAGE"

echo "Starting container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASS" \
  -e POSTGRES_DB="$DB_NAME" \
  -p "$PORT":5432 \
  "$IMAGE"

echo "Waiting for Postgres to accept connections..."
for i in {1..90}; do
  # First, check the server is accepting TCP connections (no specific DB)
  if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" >/dev/null 2>&1; then
    echo "Postgres is accepting connections"
    # Next, probe the maintenance DB `postgres` until psql can connect cleanly.
    if docker exec "$CONTAINER_NAME" psql -h 127.0.0.1 -U "$DB_USER" -d postgres -c '\q' >/dev/null 2>&1; then
      echo "Postgres 'postgres' DB is ready"
      break
    fi
  fi
  sleep 1
done

# Ensure the target database exists inside the container. Some custom Postgres
# images (or init scripts) may not create the requested DB immediately via
# POSTGRES_DB; create it explicitly if missing to make the script robust.
echo "Ensuring database '$DB_NAME' exists inside container"
if ! docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c '\q' >/dev/null 2>&1; then
  echo "Database $DB_NAME not found, creating..."
  docker exec "$CONTAINER_NAME" psql -h 127.0.0.1 -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\";"
else
  echo "Database $DB_NAME already present"
fi

echo "Ensuring pgcrypto extension is available in database '$DB_NAME'"
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" || true

echo "Applying schema: $SCHEMA_FILE"
# Use docker exec with psql reading from stdin
cat "$SCHEMA_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME"

echo "Verifying tables (first 50 rows of pg_tables in public schema):"
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "\\dt public.*"

echo "✅ jobtrack DB container '$CONTAINER_NAME' is ready and schema applied."
echo
echo "To export this container as an image (optional):"
echo "  docker commit $CONTAINER_NAME jobtrack_db:template"
echo "  docker save -o jobtrack_db_template.tar jobtrack_db:template"

exit 0
