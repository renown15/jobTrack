#!/usr/bin/env bash
set -euo pipefail

# db_fresh_docker.sh
# Create a fresh JobTrack database stack in a new Docker container.
# Applies schema, reference data, navigator AI schema, and creates a bootstrap user.
#
# Usage:
#   ./scripts/db_fresh_docker.sh
#   ./scripts/db_fresh_docker.sh --container jobtrack_fresh --port 5434

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

CONTAINER_NAME="jobtrack_fresh"
PORT=5434
IMAGE="postgres:15"
DB_NAME="jobtrack"
NAV_DB_NAME="jobtrack_navigator_ai"
DB_USER="postgres"
DB_PASS="postgres"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --container) CONTAINER_NAME="$2"; shift 2 ;;
    --port)      PORT="$2"; shift 2 ;;
    --image)     IMAGE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--container NAME] [--port PORT] [--image IMAGE]"
      exit 0 ;;
    *) echo "Unknown arg: $1"; exit 2 ;;
  esac
done

# ── Locate Python with werkzeug for password hashing ─────────────────────────
PYTHON=""
for candidate in "$ROOT_DIR/venv-m4/bin/python3" python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 || [[ -x "$candidate" ]]; then
    if "$candidate" -c "import werkzeug" 2>/dev/null; then
      PYTHON="$candidate"
      break
    fi
  fi
done
if [[ -z "$PYTHON" ]]; then
  echo "ERROR: Could not find Python with werkzeug installed."
  echo "       Activate your venv or run: pip install werkzeug"
  exit 1
fi

# ── Prompt for bootstrap user ─────────────────────────────────────────────────
echo ""
echo "Bootstrap admin user"
echo "--------------------"
read -rp "Email:      " ADMIN_EMAIL
read -rp "First name: " ADMIN_FIRST
read -rp "Last name:  " ADMIN_LAST
read -rsp "Password:   " ADMIN_PASS
echo ""

if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASS" ]]; then
  echo "ERROR: Email and password are required."
  exit 1
fi

ADMIN_HASH=$("$PYTHON" -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('$ADMIN_PASS'))")

# ── Container setup ───────────────────────────────────────────────────────────
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Container $CONTAINER_NAME already exists — removing it for a clean start."
  docker rm -f "$CONTAINER_NAME"
fi

echo "Starting Postgres container '$CONTAINER_NAME' on port $PORT..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASS" \
  -e POSTGRES_DB="$DB_NAME" \
  -p "$PORT:5432" \
  "$IMAGE"

echo "Waiting for Postgres to be ready..."
for i in {1..60}; do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" >/dev/null 2>&1; then
    if docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c '\q' >/dev/null 2>&1; then
      echo "Postgres is ready."
      break
    fi
  fi
  [[ $i -eq 60 ]] && { echo "ERROR: Postgres did not become ready in time."; exit 1; }
  sleep 1
done

export PGPASSWORD="$DB_PASS"

# ── Main database ─────────────────────────────────────────────────────────────
echo ""
echo "Setting up '$DB_NAME'..."

docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" \
  -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null

echo "  Applying schema..."
psql -h localhost -p "$PORT" -U "$DB_USER" -d "$DB_NAME" \
  -f "$ROOT_DIR/database/schema.sql" -q

echo "  Seeding reference data..."
psql -h localhost -p "$PORT" -U "$DB_USER" -d "$DB_NAME" \
  -f "$ROOT_DIR/database/seed_referencedata_and_sector.sql" -q

echo "  Creating bootstrap user ($ADMIN_EMAIL)..."
psql -h localhost -p "$PORT" -U "$DB_USER" -d "$DB_NAME" -q <<SQL
INSERT INTO public.applicantprofile (email, firstname, lastname, passwordhash, isactive, issuperuser)
VALUES ('$ADMIN_EMAIL', '$ADMIN_FIRST', '$ADMIN_LAST', '$ADMIN_HASH', true, true);
SQL

echo "  ✓ '$DB_NAME' ready."

# ── Navigator AI database ─────────────────────────────────────────────────────
echo ""
echo "Setting up '$NAV_DB_NAME'..."

docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres \
  -c "CREATE DATABASE \"$NAV_DB_NAME\";" >/dev/null

docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$NAV_DB_NAME" \
  -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null

if [[ -f "$ROOT_DIR/database/jobtrack_navigator_ai_schema.sql" ]]; then
  psql -h localhost -p "$PORT" -U "$DB_USER" -d "$NAV_DB_NAME" \
    -f "$ROOT_DIR/database/jobtrack_navigator_ai_schema.sql" -q
  echo "  ✓ '$NAV_DB_NAME' ready."
else
  echo "  ⚠ Navigator AI schema not found — skipping."
fi

unset PGPASSWORD

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Done. Fresh database stack running:"
echo "  Container:  $CONTAINER_NAME"
echo "  Port:       $PORT"
echo "  Main DB:    $DB_NAME"
echo "  Nav DB:     $NAV_DB_NAME"
echo "  User:       $DB_USER / $DB_PASS"
echo "  Login:      $ADMIN_EMAIL"
echo ""
echo "To connect:  psql -h localhost -p $PORT -U $DB_USER -d $DB_NAME"
echo "To stop:     docker rm -f $CONTAINER_NAME"
