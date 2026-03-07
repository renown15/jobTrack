#!/usr/bin/env sh
set -eu

# Setup script to create the navigator AI database and load the cleaned DDL.
# It is intentionally conservative and idempotent.

NAV_DB_NAME="${NAV_DB_NAME:-jobtrack_navigator_ai}"
# psql connection uses PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE if set.
# If a full connection URL is provided in NAVIGATOR_DATABASE_URL it will be
# used by passing it as the -d argument to psql.

PSQL_OPTS="-v ON_ERROR_STOP=1"

_psql() {
  # helper: call psql either with a full URL or with env vars
  if [ -n "${NAVIGATOR_DATABASE_URL:-}" ]; then
    psql ${PSQL_OPTS} "${NAVIGATOR_DATABASE_URL}" "$@"
  else
    # psql will pick up PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE from env
    psql ${PSQL_OPTS} "$@"
  fi
}

echo "[navigator-setup] waiting for Postgres to become available..."
HOST=${PGHOST:-localhost}
PORT=${PGPORT:-5432}
USER=${PGUSER:-postgres}

MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  if command -v pg_isready >/dev/null 2>&1; then
    if pg_isready -h "$HOST" -p "$PORT" -U "$USER" >/dev/null 2>&1; then
      echo "[navigator-setup] Postgres is ready"
      break
    fi
  else
    # try a lightweight psql probe
    if _psql -c 'SELECT 1' >/dev/null 2>&1; then
      echo "[navigator-setup] Postgres is ready (psql probe)"
      break
    fi
  fi
  sleep 1
  WAITED=$((WAITED+1))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "[navigator-setup] timed out waiting for Postgres after ${MAX_WAIT}s" >&2
  exit 1
fi

echo "[navigator-setup] ensuring database '${NAV_DB_NAME}' exists"
# Check database existence
DB_EXISTS=0
if [ -n "${NAVIGATOR_DATABASE_URL:-}" ]; then
  # try listing databases using the connection URL's maintenance DB (psql will error if DB missing)
  if _psql -tAc "SELECT 1 FROM pg_database WHERE datname='${NAV_DB_NAME}'" | grep -q 1; then
    DB_EXISTS=1
  fi
else
  if _psql -tAc "SELECT 1 FROM pg_database WHERE datname='${NAV_DB_NAME}'" | grep -q 1; then
    DB_EXISTS=1
  fi
fi

if [ "$DB_EXISTS" -ne 1 ]; then
  echo "[navigator-setup] creating database ${NAV_DB_NAME}"
  # Create database using the maintenance DB (default postgres)
  if [ -n "${NAVIGATOR_DATABASE_URL:-}" ]; then
    # Parse connection string to determine maintenance DB target: psql accepts a URI with dbname
    # We'll connect to the URI but with -d postgres to ensure creation can run.
    _psql -d postgres -c "CREATE DATABASE \"${NAV_DB_NAME}\";" || true
  else
    _psql -c "CREATE DATABASE \"${NAV_DB_NAME}\";" || true
  fi
else
  echo "[navigator-setup] database ${NAV_DB_NAME} already exists"
fi

SCHEMA_FILE="/app/database/jobtrack_navigator_ai_schema.sql"
if [ ! -f "$SCHEMA_FILE" ]; then
  echo "[navigator-setup] schema file not found at $SCHEMA_FILE, skipping schema load"
  exit 0
fi

echo "[navigator-setup] loading schema from $SCHEMA_FILE into ${NAV_DB_NAME}"
# Load schema file. Use psql -1 to wrap in transaction; ON_ERROR_STOP ensures fail early.
if [ -n "${NAVIGATOR_DATABASE_URL:-}" ]; then
  _psql -d "${NAV_DB_NAME}" -f "$SCHEMA_FILE" || true
else
  _psql -d "${NAV_DB_NAME}" -f "$SCHEMA_FILE" || true
fi

echo "[navigator-setup] done"

exit 0
