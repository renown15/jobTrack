#!/usr/bin/env bash
set -euo pipefail

# scripts/teardown_jobtrack_db.sh
# Stop and remove the local jobtrack DB container.

CONTAINER_NAME=jobtrack_db

if [[ $# -gt 0 ]]; then
  CONTAINER_NAME="$1"
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Stopping and removing container $CONTAINER_NAME"
  docker rm -f "$CONTAINER_NAME"
  echo "Removed $CONTAINER_NAME"
else
  echo "Container $CONTAINER_NAME not found"
fi

exit 0
