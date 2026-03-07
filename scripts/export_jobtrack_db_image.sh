#!/usr/bin/env bash
set -euo pipefail

# scripts/export_jobtrack_db_image.sh
# Commit the running jobtrack_db container to a local image and save as tarball.
# Usage: ./scripts/export_jobtrack_db_image.sh [container-name] [image-name] [output-tar]

CONTAINER_NAME=${1:-jobtrack_db}
IMAGE_NAME=${2:-jobtrack_db:template}
OUTPUT_TAR=${3:-jobtrack_db_template.tar}

if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Container ${CONTAINER_NAME} not found" >&2
  exit 1
fi

echo "Committing container ${CONTAINER_NAME} -> image ${IMAGE_NAME}"
docker commit "$CONTAINER_NAME" "$IMAGE_NAME"

echo "Saving image ${IMAGE_NAME} -> ${OUTPUT_TAR}"
docker save -o "$OUTPUT_TAR" "$IMAGE_NAME"

echo "Saved ${OUTPUT_TAR}"
exit 0
