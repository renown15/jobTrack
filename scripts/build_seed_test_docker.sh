#!/usr/bin/env bash
set -euo pipefail

# Orchestrator for Docker-backed test DB: setup -> seed -> tests -> teardown
# Usage:
#   ./scripts/build_seed_test_docker.sh [--port 5433] [--container-name jobtrack_db] [--image postgres:15] [--db jobtrack_test] [--user postgres] [--pass postgres] [--no-teardown]

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

PORT=5433
CONTAINER_NAME=jobtrack_db
IMAGE=ramsrib/pgvector:15
DB_NAME=jobtrack_test
DB_USER=postgres
DB_PASS=postgres
NO_TEARDOWN=0
NAV_DB_NAME=jobtrack_navigator_ai_test
NAV_SCHEMA="$ROOT_DIR/database/jobtrack_navigator_ai_schema.sql"

# Control whether flake8 failures should abort the uberscript.
# Defaults to non-fatal in local runs; set `FAIL_ON_FLAKE=1` to make flake8 fatal.
FAIL_ON_FLAKE="${FAIL_ON_FLAKE:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --container-name) CONTAINER_NAME="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    --db) DB_NAME="$2"; shift 2 ;;
    --user) DB_USER="$2"; shift 2 ;;
    --pass) DB_PASS="$2"; shift 2 ;;
    --nav-db) NAV_DB_NAME="$2"; shift 2 ;;
    --nav-schema) NAV_SCHEMA="$2"; shift 2 ;;
    --no-teardown) NO_TEARDOWN=1; shift ;;
    -h|--help)
      echo "Usage: $0 [--port <port>] [--container-name <name>] [--db <name>] [--user <user>] [--pass <pass>] [--no-teardown]"
      exit 0
      ;;
    *) echo "Unknown arg: $1"; exit 2 ;;
  esac
done

echo "Docker uberscript: setup -> seed -> tests -> teardown"
echo "  container: $CONTAINER_NAME"
echo "  image:     $IMAGE"
echo "  port:      $PORT -> container 5432"
echo "  database:  $DB_NAME"
echo "  user:      $DB_USER"

# Pre-build quality checks: run type checks and linters locally before doing heavy Docker work.
echo "Running pre-build quality checks: mypy, flake8, bandit, frontend lint"

# Python type checks (prefer local venv-m4 if present)
if [[ -x "$ROOT_DIR/venv-m4/bin/mypy" ]]; then
  "$ROOT_DIR/venv-m4/bin/mypy" --show-error-codes --pretty .
elif command -v mypy >/dev/null 2>&1; then
  mypy --show-error-codes --pretty .
else
  echo "mypy not found; skipping type checks"
fi

# Python lint (flake8) — rely on project .flake8 for excludes
if [[ -x "$ROOT_DIR/venv-m4/bin/flake8" ]]; then
  if [[ "${FAIL_ON_FLAKE}" -eq 1 ]]; then
    "$ROOT_DIR/venv-m4/bin/flake8" .
  else
    "$ROOT_DIR/venv-m4/bin/flake8" . || echo "flake8 reported issues (non-fatal because FAIL_ON_FLAKE=0)"
  fi
elif command -v flake8 >/dev/null 2>&1; then
  if [[ "${FAIL_ON_FLAKE}" -eq 1 ]]; then
    flake8 .
  else
    flake8 . || echo "flake8 reported issues (non-fatal because FAIL_ON_FLAKE=0)"
  fi
else
  echo "flake8 not found; skipping lint"
fi

# Security quick-scan (bandit) - non-fatal
if [[ -x "$ROOT_DIR/venv-m4/bin/bandit" ]]; then
  "$ROOT_DIR/venv-m4/bin/bandit" -r . -f text --exclude ./venv*,./node_modules,./tools,./scripts,./build || true
elif command -v bandit >/dev/null 2>&1; then
  bandit -r . -f text --exclude ./venv*,./node_modules,./tools,./scripts,./build || true
else
  echo "bandit not found; skipping security checks"
fi

# Frontend lint moved to `scripts/run_local_docker.sh` to keep local Docker
# build/test orchestration focused on DB setup and test execution.

SEED_SQL="$ROOT_DIR/database/prime_test_db.sql"

on_exit() {
  rc=$?
  if [[ "$NO_TEARDOWN" -ne 1 ]]; then
    echo "Running teardown for container $CONTAINER_NAME"
    "$ROOT_DIR/scripts/teardown_jobtrack_db.sh" "$CONTAINER_NAME" || true
  else
    echo "Skipping teardown (--no-teardown supplied). Container $CONTAINER_NAME remains running."
  fi
  exit $rc
}

trap on_exit EXIT

echo "Setting up Docker Postgres..."
# If a container with the target name exists, remove it to ensure a clean start.
if docker ps -a --format '{{.Names}}' | grep -wq "$CONTAINER_NAME"; then
  echo "Container $CONTAINER_NAME already exists; removing it for a clean start"
  docker rm -f "$CONTAINER_NAME" || true
fi

"$ROOT_DIR/scripts/setup_jobtrack_db.sh" --port "$PORT" --container-name "$CONTAINER_NAME" --image "$IMAGE" --db "$DB_NAME" --user "$DB_USER" --pass "$DB_PASS"

echo "Seeding test DB from $SEED_SQL"
if [[ -f "$SEED_SQL" ]]; then
  # Use psql on host connecting to published port; export PGPASSWORD for non-interactive auth
  export PGPASSWORD="$DB_PASS"
  psql -h "localhost" -p "$PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SEED_SQL"
  unset PGPASSWORD
else
  echo "Warning: seed file not found: $SEED_SQL (skipping)"
fi

# Optional: create and load navigator AI database schema into the same container
if [[ -n "$NAV_SCHEMA" && -f "$NAV_SCHEMA" ]]; then
  echo "Creating navigator DB '$NAV_DB_NAME' and loading schema from $NAV_SCHEMA"
  export PGPASSWORD="$DB_PASS"
  # Create DB (drop/recreate to ensure a clean state)
  if psql -h "localhost" -p "$PORT" -U "$DB_USER" -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$NAV_DB_NAME'" | grep -q 1; then
    echo "Navigator DB $NAV_DB_NAME already exists - dropping and recreating"
    psql -h "localhost" -p "$PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE \"$NAV_DB_NAME\";"
  fi
  psql -h "localhost" -p "$PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$NAV_DB_NAME\";"
  # Ensure pgcrypto (used by pgp_sym_encrypt) is available in the navigator DB
  psql -h "localhost" -p "$PORT" -U "$DB_USER" -d "$NAV_DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" || true
  # Ensure vector extension is available (some images preinstall it; schema may also create it)
  psql -h "localhost" -p "$PORT" -U "$DB_USER" -d "$NAV_DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;" || true
  # Load schema into navigator DB
  psql -h "localhost" -p "$PORT" -U "$DB_USER" -d "$NAV_DB_NAME" -f "$NAV_SCHEMA"
  unset PGPASSWORD
  # Export navigator DB name for tests/modules that read NAVIGATOR_DB_NAME
  export NAVIGATOR_DB_NAME="$NAV_DB_NAME"
  # Provide an explicit TEST_NAVIGATOR_DATABASE_URL for convenience
  export TEST_NAVIGATOR_DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:${PORT}/${NAV_DB_NAME}"
  echo "Exported NAVIGATOR_DB_NAME=$NAVIGATOR_DB_NAME and TEST_NAVIGATOR_DATABASE_URL=$TEST_NAVIGATOR_DATABASE_URL"
else
  echo "No navigator schema found at $NAV_SCHEMA - skipping navigator DB setup"
fi

TEST_DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:${PORT}/${DB_NAME}"
export TEST_DATABASE_URL

echo "Running test runner with TEST_DATABASE_URL=$TEST_DATABASE_URL"
# Ensure psql client libraries can authenticate non-interactively during tests
export PGPASSWORD="$DB_PASS"
TEST_DATABASE_URL="$TEST_DATABASE_URL" "$ROOT_DIR/scripts/run-tests.sh"
unset PGPASSWORD

echo "Completed uberscript run."

# on_exit trap will run teardown unless --no-teardown set

exit 0
