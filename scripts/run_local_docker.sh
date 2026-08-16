#!/usr/bin/env sh
set -euo pipefail

# Rebuild the local Docker image and run it with environment from .env.docker
# Usage: ./scripts/run_local_docker.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

IMAGE_NAME="jobtrack:local"
CONTAINER_NAME="jobtrack_local"
ENV_FILE=".env.docker"

echo "Building Docker image ${IMAGE_NAME}..."
echo "Running Python pre-checks (mypy, flake8, bandit) then frontend lint and TypeScript checks (ESLint + tsc)"

# Python pre-checks: prefer local venv-m4 executables
if [ -x "${ROOT_DIR}/venv-m4/bin/mypy" ]; then
  echo "Running mypy via venv-m4"
  "${ROOT_DIR}/venv-m4/bin/mypy" --show-error-codes --pretty .
elif command -v mypy >/dev/null 2>&1; then
  echo "Running mypy"
  mypy --show-error-codes --pretty .
else
  echo "mypy not found; skipping type checks"
fi

if [ -x "${ROOT_DIR}/venv-m4/bin/flake8" ]; then
  echo "Running flake8 via venv-m4"
  "${ROOT_DIR}/venv-m4/bin/flake8" .
elif command -v flake8 >/dev/null 2>&1; then
  echo "Running flake8"
  flake8 .
else
  echo "flake8 not found; skipping lint"
fi

if [ -x "${ROOT_DIR}/venv-m4/bin/bandit" ]; then
  echo "Running bandit via venv-m4 (non-fatal)"
  "${ROOT_DIR}/venv-m4/bin/bandit" -r . -f txt --exclude ./venv,./venv-m4,./node_modules,./tools,./tools-python,./scripts || true
elif command -v bandit >/dev/null 2>&1; then
  echo "Running bandit (non-fatal)"
  bandit -r . -f txt --exclude ./venv,./venv-m4,./node_modules,./tools,./tools-python,./scripts || true
else
  echo "bandit not found; skipping security checks"
fi
if command -v npm >/dev/null 2>&1; then
  if [ -d "${ROOT_DIR}/frontend/node_modules" ]; then
    echo "Frontend deps found — running lint and tsc"
    npm --prefix frontend run lint || echo "frontend lint failed (non-fatal)"
    npx --prefix frontend tsc --noEmit || echo "frontend tsc typecheck failed (non-fatal)"
  else
    echo "Frontend deps missing — installing dev deps (npm ci) then running lint+tsc"
    npm --prefix frontend ci --silent
    npm --prefix frontend run lint || echo "frontend lint failed (non-fatal)"
    npx --prefix frontend tsc --noEmit || echo "frontend tsc typecheck failed (non-fatal)"
  fi
else
  echo "npm not found; skipping frontend lint and TS checks"
fi

docker build -t "${IMAGE_NAME}" .

if [ -f "${ENV_FILE}" ]; then
  echo "Using env file: ${ENV_FILE}"
else
  echo "Warning: ${ENV_FILE} not found. Container will run without --env-file."
  ENV_FILE=""
fi

EXISTING=$(docker ps -a --filter "name=^/${CONTAINER_NAME}$" --format "{{.ID}}") || EXISTING=""
if [ -n "${EXISTING}" ]; then
  echo "Stopping and removing existing container ${CONTAINER_NAME} (${EXISTING})..."
  docker rm -f "${CONTAINER_NAME}" || true
fi

echo "Starting container ${CONTAINER_NAME} from image ${IMAGE_NAME}..."
RUN_CMD="docker run -d --name ${CONTAINER_NAME} -p 8080:8080"
if [ -n "${ENV_FILE}" ]; then
  RUN_CMD="${RUN_CMD} --env-file ${ENV_FILE}"
fi

# Optional mounts (uncomment if needed)
# RUN_CMD="${RUN_CMD} -v $ROOT_DIR/static/navigator_uploads:/app/static/navigator_uploads"

RUN_CMD="${RUN_CMD} ${IMAGE_NAME}"

echo "Executing: ${RUN_CMD}"
sh -c "${RUN_CMD}"

echo "Container started. Use 'docker logs -f ${CONTAINER_NAME}' to follow logs." 
