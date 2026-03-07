#!/usr/bin/env bash
set -euo pipefail

# Load local environment variables from the repository root if present.
# Developers can keep a private `.env.local` with lines like:
#   export NAVIGATOR_BRIEFING_KEY='...'
# This block resolves the script directory and then looks for `.env.local`
# one level up (the project root) so the script behaves the same regardless
# of the current working directory when invoked.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.local"
if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    # shellcheck source=/dev/null
    echo "Sourcing $ENV_FILE"
    # Use `set -a` so that any variable assignments in the env file are
    # automatically exported to child processes. This is simpler and more
    # reliable across shells than attempting to manually parse and export
    # lines. After sourcing we turn off the automatic export.
    set -a
    . "$ENV_FILE"
    set +a
fi

# start-server.sh - Manage the JobTrack Flask dev server
# Usage: ./scripts/start-server.sh start|stop|status|tail|restart [LOG_LEVEL]

# Adjust these paths if your layout differs
VENV_PY="/Users/marklewis/dev/jobTrack/venv-m4/bin/python3"
# Prefer running the package entrypoint so the new `jobtrack` package
# bridge can be used during the refactor. This falls back to the plain
# `app.py` file when necessary; we default to the module form.
APP_MODULE="-m jobtrack.app"
PIDFILE="/tmp/jobtrack_server.pid"
LOGFILE="/tmp/jobtrack.log"
PORT=${PORT:-8080}

# Ensure Python can find the backend package when the script is run from any cwd
BACKEND_DIR="$PROJECT_ROOT/backend"
export PYTHONPATH="$BACKEND_DIR:${PYTHONPATH:-}"

# Allow passing a log level as the second argument to `start`/`restart` or via
# the environment variable `LOG_LEVEL`. Default to INFO when not provided.
DEFAULT_LOG_LEVEL=${LOG_LEVEL:-INFO}

usage() {
    echo "Usage: $0 {start|stop|restart|status|tail} [LOG_LEVEL] [DEV_DEBUG]"
    echo "  LOG_LEVEL: optional log level (INFO|DEBUG)."
    echo "  DEV_DEBUG: optional flag for dev debug output (1|0). If set to 1, additional debug details may be enabled in the app."
    exit 2
}

start() {
    if [ -f "$PIDFILE" ]; then
        PID=$(cat "$PIDFILE" 2>/dev/null || true)
        if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
            echo "Server already running (PID $PID)"
            exit 0
        else
            echo "Removing stale pidfile"
            rm -f "$PIDFILE"
        fi
    fi

    echo "Starting JobTrack server on port $PORT (LOG_LEVEL=${LOG_LEVEL:-$DEFAULT_LOG_LEVEL}, DEV_DEBUG=${DEV_DEBUG:-0})..."
    # Use nohup to detach; avoid setsid which is not available on some macOS installs
    # Export LOG_LEVEL and DEV_DEBUG into the process environment so app.py picks them up.
    LOG_LEVEL=${LOG_LEVEL:-$DEFAULT_LOG_LEVEL}
    DEV_DEBUG=${DEV_DEBUG:-0}
    # Prefer running the package module `jobtrack.app` if importable, otherwise
    # fall back to the top-level `app.py` script. This makes the script work
    # both during refactor (when package entry exists) and in older layouts.
    # Fail-fast: require the new `jobtrack_core.app` package to be present.
    if "$VENV_PY" -c "import importlib,sys; importlib.import_module('jobtrack_core.app')" 2>/dev/null; then
        echo "Launching module jobtrack_core.app"
        PORT=$PORT LOG_LEVEL=$LOG_LEVEL DEV_DEBUG=$DEV_DEBUG nohup "$VENV_PY" -m jobtrack_core.app > "$LOGFILE" 2>&1 &
    else
        echo "ERROR: Python module 'jobtrack_core.app' is not importable."
        echo "Ensure your virtualenv (VENV_PY='$VENV_PY') is active and the backend package 'jobtrack_core' is available under 'backend/'."
        exit 2
    fi
    NEWPID=$!
    echo $NEWPID > "$PIDFILE"
    sleep 0.3
    echo "Started (PID $NEWPID). Log: $LOGFILE"
}

stop() {
    if [ ! -f "$PIDFILE" ]; then
        echo "No pidfile found at $PIDFILE"
        exit 0
    fi
    PID=$(cat "$PIDFILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Stopping PID $PID"
        kill "$PID"
        sleep 0.3
        if kill -0 "$PID" 2>/dev/null; then
            echo "PID $PID did not stop - killing"
            kill -9 "$PID" || true
        fi
    else
        echo "Process $PID not running"
    fi
    rm -f "$PIDFILE"
    echo "Stopped"
}

status() {
    if [ -f "$PIDFILE" ]; then
        PID=$(cat "$PIDFILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "Running (PID $PID)"
            curl -fsS "http://127.0.0.1:$PORT/" || echo "(no HTTP response yet)"
            return 0
        else
            echo "Stale pidfile (PID $PID not running)"
            return 1
        fi
    else
        echo "Not running (no pidfile)"
        return 1
    fi
}

taillog() {
    echo "Tailing log $LOGFILE"
    tail -n 200 -f "$LOGFILE"
}

case "${1:-}" in
    start)
        # If a second arg provided, treat it as desired LOG_LEVEL (e.g., DEBUG)
        if [ -n "${2:-}" ]; then
            # Use a POSIX-compatible transformation to uppercase the provided level
            LOG_LEVEL="$(printf '%s' "${2}" | tr '[:lower:]' '[:upper:]')"
        fi
        # Optional third arg: DEV_DEBUG flag (1 = enabled)
        if [ -n "${3:-}" ]; then
            DEV_DEBUG="${3}"
        fi
        start
        ;;
    stop)
        stop
        ;;
    restart)
        # Accept optional log level for restart as well
        if [ -n "${2:-}" ]; then
            # Use a POSIX-compatible transformation to uppercase the provided level
            LOG_LEVEL="$(printf '%s' "${2}" | tr '[:lower:]' '[:upper:]')"
        fi
        # Optional third arg: DEV_DEBUG flag (1 = enabled)
        if [ -n "${3:-}" ]; then
            DEV_DEBUG="${3}"
        fi
        stop || true
        start
        ;;
    status)
        status
        ;;
    tail)
        taillog
        ;;
    *)
        usage
        ;;
esac
