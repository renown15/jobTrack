#!/usr/bin/env zsh
# Simple dev wrapper: copy the repo-root .env.local into frontend/.env.local
# and start the frontend dev server. This copies the entire file (user requested).
# Usage:
#   ./scripts/start-frontend-dev.sh        # will refuse if dest exists
#   ./scripts/start-frontend-dev.sh --force

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_ENV="$REPO_ROOT/.env.local"
DEST_DIR="$REPO_ROOT/frontend"
DEST_ENV="$DEST_DIR/.env.local"

FORCE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force|-f)
      FORCE=true
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [[ ! -f "$SRC_ENV" ]]; then
  echo "ERROR: source $SRC_ENV not found; create it first or pass env via CLI" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"

if [[ -f "$DEST_ENV" && "$FORCE" != "true" ]]; then
  echo "Found existing $DEST_ENV. Use --force to overwrite or remove it manually." >&2
  exit 1
fi

cp "$SRC_ENV" "$DEST_ENV"
echo "Copied $SRC_ENV -> $DEST_ENV"

echo "Starting frontend dev server in $DEST_DIR..."
cd "$DEST_DIR"

# Start dev server. Users can also run with environment overrides if needed.
npm run dev
#!/usr/bin/env bash
set -euo pipefail

# Start the frontend Vite dev server with a configured API base URL.
# Usage:
#   ./scripts/start-frontend-dev.sh            # uses default http://localhost:8080
#   VITE_API_BASE_URL=http://backend:8080 ./scripts/start-frontend-dev.sh
#   API_BASE_URL=http://backend:8080 ./scripts/start-frontend-dev.sh

# Default backend if not provided
: "${API_BASE_URL:=http://localhost:8080}"
# Allow overriding the variable name used by Vite directly
VITE_API_BASE_URL="${VITE_API_BASE_URL:-$API_BASE_URL}"

echo "Starting Vite dev server with VITE_API_BASE_URL=$VITE_API_BASE_URL"

# Move to the frontend directory relative to repo root (scripts/ is in repo root)
cd "$(dirname "$0")/../frontend" || { echo "Failed to cd to frontend"; exit 1; }

# Export for the invocation and run the dev server
export VITE_API_BASE_URL

# Use exec to replace the shell with the dev server process
exec env VITE_API_BASE_URL="$VITE_API_BASE_URL" npm run dev
