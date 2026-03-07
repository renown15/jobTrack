#!/usr/bin/env bash
# Helper to run gunicorn using the repository venv to avoid pyenv/shim mismatches.
# Usage: ./tools/run-gunicorn-local.sh [--reinstall] [--port PORT]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="$REPO_ROOT/venv-m4"
PYTHON_BIN="$VENV_DIR/bin/python"
GUNICORN_MODULE=gunicorn

REINSTALL=0
PORT=8080

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reinstall) REINSTALL=1; shift ;;
    --port) PORT="$2"; shift 2 ;;
    --help) echo "Usage: $0 [--reinstall] [--port PORT]"; exit 0 ;;
    *) echo "Unknown arg: $1"; exit 2 ;;
  esac
done

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Virtualenv not found at $VENV_DIR. Creating..."
  python3 -m venv "$VENV_DIR"
fi

echo "Using Python: $PYTHON_BIN"

# Optionally reinstall dependencies
if [[ "$REINSTALL" -eq 1 ]]; then
  echo "Installing project dependencies into venv..."
  "$PYTHON_BIN" -m pip install --upgrade pip
  "$PYTHON_BIN" -m pip install -e "$REPO_ROOT"
fi

# Ensure the project is installed (editable) so imports work
if ! "$PYTHON_BIN" -c "import pkgutil, sys; sys.exit(0 if pkgutil.find_loader('jobtrack') or pkgutil.find_loader('app') else 1)" 2>/dev/null; then
  echo "Installing project into venv (editable)..."
  "$PYTHON_BIN" -m pip install -e "$REPO_ROOT"
fi

# Default dev env vars if not set
: "${DATABASE_URL:=postgres://user:pass@localhost:5432/jobtrack_dev}"
: "${FLASK_SECRET_KEY:=dev-secret}"
: "${JOBTRACK_LOG_FILE:=/dev/stdout}"

export DATABASE_URL
export FLASK_SECRET_KEY
export JOBTRACK_LOG_FILE

echo "Environment:"
echo "  DATABASE_URL=$DATABASE_URL"
echo "  FLASK_SECRET_KEY=(hidden)"
echo "  JOBTRACK_LOG_FILE=$JOBTRACK_LOG_FILE"

echo "Starting gunicorn via venv Python (port $PORT)..."
exec "$PYTHON_BIN" -m $GUNICORN_MODULE --bind 127.0.0.1:"$PORT" --workers 1 --threads 4 --timeout 120 \
  --access-logfile - --error-logfile - app:app
