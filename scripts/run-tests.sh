#!/usr/bin/env bash
#
# Unified Test Runner for JobTrack
#
# Runs different test suites based on flags:
#   - Frontend unit tests (standalone, no backend needed)
#   - Python unit tests (standalone)
#   - Python integration tests (requires dockerized DB)
#   - Frontend integration tests (requires dockerized DB + Flask backend)
#
# Usage:
#   ./scripts/run-tests.sh [options]
#
# Options:
#   --unit              Run only unit tests (Python + Frontend, no DB)
#   --integration       Run only integration tests (requires Docker)
#   --frontend          Run only frontend tests (unit or integration based on other flags)
#   --python            Run only Python tests (unit or integration based on other flags)
#   --coverage          Enable coverage reporting
#   --no-cleanup        Keep Docker container running after tests
#   --verbose           Show detailed output
#   --help              Show this help message
#
# Examples:
#   ./scripts/run-tests.sh                    # Run all tests (unit + integration)
#   ./scripts/run-tests.sh --unit             # Run only unit tests (fast, no Docker)
#   ./scripts/run-tests.sh --integration      # Run only integration tests
#   ./scripts/run-tests.sh --frontend --unit  # Run only frontend unit tests
#   ./scripts/run-tests.sh --python           # Run all Python tests

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# Backend dir for canonical layout
BACKEND_DIR="$PROJECT_ROOT/backend"

# Ensure backend package is on PYTHONPATH so tests can import `jobtrack_core`
# Use a safe default in case PYTHONPATH is not set (script uses `set -u`).
export PYTHONPATH="$BACKEND_DIR:${PYTHONPATH:-}"


# Configuration
POSTGRES_CONTAINER="jobtrack-test-db"
POSTGRES_PORT=${POSTGRES_PORT:-5433}
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres"
POSTGRES_DB="jobtrack_test"
POSTGRES_NAV_DB="jobtrack_navigator_ai_test"
POSTGRES_IMAGE="ramsrib/pgvector:15"
FLASK_PORT=5001

# Flags
RUN_UNIT=false
RUN_INTEGRATION=false
RUN_FRONTEND=false
RUN_PYTHON=false
COVERAGE=false
NO_CLEANUP=false
VERBOSE=false
TEST_FILE=""
RECREATE_DB=false
SINGLE_THREADED=false

# Parse arguments
if [ $# -eq 0 ]; then
  # No args = run everything
  RUN_UNIT=true
  RUN_INTEGRATION=true
  RUN_FRONTEND=true
  RUN_PYTHON=true
fi

while [[ $# -gt 0 ]]; do
  case $1 in
    --unit)
      RUN_UNIT=true
      shift
      ;;
    --integration)
      RUN_INTEGRATION=true
      shift
      ;;
    --frontend)
      RUN_FRONTEND=true
      shift
      ;;
    --python)
      RUN_PYTHON=true
      shift
      ;;
    --coverage)
      COVERAGE=true
      shift
      ;;
    --no-cleanup)
      NO_CLEANUP=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help)
      head -n 30 "$0" | grep "^#" | sed 's/^# //' | sed 's/^#//'
      exit 0
      ;;
    --recreate-db)
      RECREATE_DB=true
      shift
      ;;
    --single-thread)
      SINGLE_THREADED=true
      shift
      ;;
    --test-file)
      TEST_FILE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# If specific test type selected without unit/integration, default to both
if [ "$RUN_FRONTEND" = true ] || [ "$RUN_PYTHON" = true ]; then
  if [ "$RUN_UNIT" = false ] && [ "$RUN_INTEGRATION" = false ]; then
    RUN_UNIT=true
    RUN_INTEGRATION=true
  fi
else
  RUN_FRONTEND=true
  RUN_PYTHON=true
fi

# If a specific test file is provided and it is a Python test, detect whether
# the file contains integration markers and enable the integration flow so the
# Docker DB and seed scripts will run. This ensures running a single
# integration test via --test-file will still prepare the database.
if [ -n "$TEST_FILE" ]; then
  # extract path before pytest node id separator '::' if present
  TEST_FILE_PATH="${TEST_FILE%%::*}"
    if [[ "$TEST_FILE_PATH" == *.py ]] && [ -f "$TEST_FILE_PATH" ]; then
    if grep -q "pytest.mark.integration" "$TEST_FILE_PATH" || grep -q "@pytest.mark.integration" "$TEST_FILE_PATH"; then
      echo "[INFO] Detected integration marker in $TEST_FILE_PATH; enabling integration test flow (will start Docker DB and seed)"
      RUN_INTEGRATION=true
      RUN_PYTHON=true
    fi
  fi
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $*"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*"
}

log_section() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}  $*${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

cleanup() {
  local exit_code=$?
  
  if [ "$NO_CLEANUP" = true ]; then
    log_info "Skipping cleanup (--no-cleanup flag set)"
    if docker ps | grep -q "$POSTGRES_CONTAINER"; then
      log_info "Docker container: $POSTGRES_CONTAINER (port $POSTGRES_PORT)"
      log_info "To stop: docker stop $POSTGRES_CONTAINER && docker rm $POSTGRES_CONTAINER"
    fi
    exit $exit_code
  fi

  # Stop Flask server if running
  if [ -n "${FLASK_PID:-}" ]; then
    log_info "Stopping Flask server (PID: $FLASK_PID)"
    kill $FLASK_PID 2>/dev/null || true
    wait $FLASK_PID 2>/dev/null || true
  fi
  
  # Stop and remove Docker container
  if docker ps -a | grep -q "$POSTGRES_CONTAINER"; then
    log_info "Stopping Docker container: $POSTGRES_CONTAINER"
    docker stop "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
    docker rm "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
  fi
  
  exit $exit_code
}

trap cleanup EXIT INT TERM

# ============================================================================
# UNIT TESTS
# ============================================================================

if [ "$RUN_UNIT" = true ]; then
  
  if [ "$RUN_PYTHON" = true ]; then
    log_section "Python Unit Tests"
    
    cd "$PROJECT_ROOT"
    
    # Install dependencies
    log_info "Installing Python dependencies..."
    python3 -m pip install --upgrade pip setuptools wheel > /dev/null
    
    # Type checking with mypy
    if [ "${SKIP_MYPY:-0}" -ne 1 ]; then
      log_info "Running mypy type checks..."
      python3 -m pip install --no-cache-dir mypy > /dev/null
      python3 -m pip install --no-cache-dir types-requests types-openpyxl types-psycopg2 > /dev/null 2>&1 || true
      # Remove mypy cache to avoid stale cached type info causing false failures
      if [ -d ".mypy_cache" ]; then
        log_info "Removing .mypy_cache to avoid stale mypy data"
        rm -rf .mypy_cache || true
      fi
      mypy --show-error-codes --pretty .

      # Run Pyright (TypeScript/JS type checks) alongside Python type checks.
      # Pyright lives in the frontend directory and may require frontend deps.
      if [ -d "$FRONTEND_DIR" ] && command -v npx >/dev/null 2>&1; then
        log_info "Running Pyright checks - installing frontend deps for consistent environment..."
        cd "$FRONTEND_DIR"
        npm ci --silent
        cd "$PROJECT_ROOT"
        log_info "Running pyright from inside the backend folder (pyright-backend.json)..."
        # Run pyright with CWD set to backend so analysis is confined to backend files.
        # Use the frontend-installed pyright binary if available.
        pushd "$BACKEND_DIR" >/dev/null
        npx --prefix "$FRONTEND_DIR" pyright . --project "$PROJECT_ROOT/pyright-backend.json"
        popd >/dev/null
      else
        log_warn "Skipping Pyright: frontend directory missing or npx unavailable"
      fi
    else
      log_warn "SKIP_MYPY=1; skipping mypy"
    fi
    
    # Install package and test deps
    pip install --no-cache-dir . > /dev/null
    pip install --no-cache-dir pytest pytest-cov > /dev/null
    
    # Run unit tests (exclude integration tests)
    log_info "Running Python unit tests..."
    if [ -n "$TEST_FILE" ]; then
      # If a specific test file was provided and it's a Python file, run only that
      if [[ "$TEST_FILE" == *.py ]]; then
        log_info "Running pytest for single file: $TEST_FILE"
        if [ "$COVERAGE" = true ]; then
          pytest -v --cov=./ --cov-report=term-missing "$TEST_FILE"
        else
          pytest -v "$TEST_FILE"
        fi
      else
        log_warn "--test-file specified but not a Python file; running full Python unit suite"
        if [ "$COVERAGE" = true ]; then
          pytest -v --cov=./ --cov-report=term-missing -m "not integration"
        else
          pytest -v -m "not integration"
        fi
      fi
    else
      if [ "$COVERAGE" = true ]; then
        pytest -v --cov=./ --cov-report=term-missing -m "not integration"
      else
        pytest -v -m "not integration"
      fi
    fi
    
    log_info "✅ Python unit tests completed"
  fi
  
  if [ "$RUN_FRONTEND" = true ]; then
    log_section "Frontend Unit Tests"
    
    if [ -d "$FRONTEND_DIR" ]; then
      cd "$FRONTEND_DIR"
      
      log_info "Installing frontend dependencies..."
      npm ci --silent
      
      # TypeScript type check before running tests
      if command -v npx >/dev/null 2>&1; then
        # Run Pyright (faster/lighter TypeScript type checking) when available
          log_info "Running TypeScript checks (npx tsc --noEmit)..."
          npx tsc --noEmit
          log_info "TypeScript checks passed"
      else
        log_warn "npx not available; skipping TypeScript checks"
      fi
      
      log_info "Running frontend unit tests..."
      # Determine vitest worker settings: default to multithreaded unless
      # the user passed --single-thread or set SINGLE_THREADED=true.
      VITEST_FLAGS=""
      if [ "$SINGLE_THREADED" = true ]; then
        VITEST_FLAGS="--maxWorkers 1 --fileParallelism false"
      fi

      # If a specific frontend test file is provided, prefer running it directly
      if [ -n "$TEST_FILE" ]; then
        # Use vitest to run a single test file when provided
        if [[ "$TEST_FILE" == *.ts || "$TEST_FILE" == *.tsx || "$TEST_FILE" == *.test.* ]]; then
          log_info "Running frontend test file: $TEST_FILE"
          if command -v npx >/dev/null 2>&1; then
            # Run frontend tests serially to avoid intermittent ordering/timeouts
            if [ "$COVERAGE" = true ]; then
              npx vitest run $VITEST_FLAGS "$TEST_FILE" --coverage
            else
              npx vitest run $VITEST_FLAGS "$TEST_FILE"
            fi
          else
            log_warn "npx not available; running npm test fallback"
            npm test -- --run
          fi
        else
          log_warn "--test-file specified but not a TypeScript frontend file; running full frontend unit suite"
          if [ "$COVERAGE" = true ]; then
            npm test -- --run --coverage
          else
            npm test -- --run
          fi
        fi
      else
        # Run Vitest with configurable worker settings (multithreaded by default).
        if command -v npx >/dev/null 2>&1; then
          if [ "$COVERAGE" = true ]; then
            npx vitest run $VITEST_FLAGS --coverage
          else
            npx vitest run $VITEST_FLAGS
          fi
        else
          if [ "$COVERAGE" = true ]; then
            npm test -- --run --coverage
          else
            npm test -- --run
          fi
        fi
      fi
      
      log_info "✅ Frontend unit tests completed"
    else
      log_warn "Frontend directory not found, skipping frontend unit tests"
    fi
  fi
fi

# ============================================================================
# Single-threaded frontend tests (run after main frontend unit run)
# Tests that are fragile and require single-threaded execution should be
# written to skip themselves when the env var VITEST_SINGLE_THREADED is not
# set to 'true'. We run them here with a single-worker Vitest invocation.
# ============================================================================

if [ "$RUN_UNIT" = true ] && [ "$RUN_FRONTEND" = true ]; then
  # List of frontend test files that must run single-threaded (workspace-relative to frontend/)
  SINGLE_THREADED_TEST_FILES=(
    "src/components/Hub/__tests__/QuickCreateModal.test.tsx"
    "src/pages/__tests__/Coaching.test.tsx"
  )

  # Only run if the frontend directory exists
  if [ -d "$FRONTEND_DIR" ]; then
    cd "$FRONTEND_DIR"
    for sf in "${SINGLE_THREADED_TEST_FILES[@]}"; do
      if [ -f "$sf" ]; then
        log_section "Single-threaded frontend test: $sf"
        log_info "Running $sf in single-threaded mode"
        # Export an env var that the test file can check to enable itself
        if command -v npx >/dev/null 2>&1; then
          if [ "$COVERAGE" = true ]; then
            VITEST_SINGLE_THREADED=true VITEST_FLAGS="--maxWorkers 1 --fileParallelism false" npx vitest run --maxWorkers 1 --fileParallelism false "$sf" --coverage
          else
            VITEST_SINGLE_THREADED=true VITEST_FLAGS="--maxWorkers 1 --fileParallelism false" npx vitest run --maxWorkers 1 --fileParallelism false "$sf"
          fi
        else
          log_warn "npx not available; running npm test fallback for single-threaded test"
          if [ "$COVERAGE" = true ]; then
            VITEST_SINGLE_THREADED=true npm test -- --run "$sf" --coverage
          else
            VITEST_SINGLE_THREADED=true npm test -- --run "$sf"
          fi
        fi
      else
        log_warn "Single-threaded test file not found: $sf"
      fi
    done
  fi
fi

# ============================================================================
# INTEGRATION TESTS (require Docker)
# ============================================================================

if [ "$RUN_INTEGRATION" = true ]; then
  
  log_section "Docker PostgreSQL Setup"
  
  # Start PostgreSQL container
  log_info "Starting PostgreSQL Docker container..."
  if docker ps | grep -q "$POSTGRES_CONTAINER"; then
    log_warn "Container already running, stopping it first"
    docker stop "$POSTGRES_CONTAINER" >/dev/null
    docker rm "$POSTGRES_CONTAINER" >/dev/null
  fi
  
  docker run -d \
    --name "$POSTGRES_CONTAINER" \
    -e POSTGRES_USER="$POSTGRES_USER" \
    -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -e POSTGRES_DB="$POSTGRES_DB" \
    -p "$POSTGRES_PORT:5432" \
    "$POSTGRES_IMAGE"
  
  log_info "Waiting for PostgreSQL to be ready..."
  for i in {1..30}; do
    if docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" -h localhost >/dev/null 2>&1; then
      log_info "PostgreSQL is ready"
      break
    fi
    if [ $i -eq 30 ]; then
      log_error "PostgreSQL failed to start within 30 seconds"
      docker logs "$POSTGRES_CONTAINER"
      exit 1
    fi
    sleep 1
  done
  
  # Verify database exists, create if not (handles POSTGRES_DB env not working)
  DB_EXISTS=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -h localhost -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'")
  if [ "$DB_EXISTS" != "1" ]; then
    log_info "Creating database $POSTGRES_DB..."
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -h localhost -d postgres -c "CREATE DATABASE $POSTGRES_DB;"
  fi
  
  # Apply main database schema
  log_info "Applying database schema..."
  # Validate and apply schema with ON_ERROR_STOP to fail fast on syntax/ordering errors
  docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -h localhost -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f - < "$PROJECT_ROOT/database/schema.sql" 2>&1 | tee /tmp/schema-apply.log || {
    log_error "Applying database/schema.sql failed. See /tmp/schema-apply.log for details."
    docker logs "$POSTGRES_CONTAINER" | sed -n '1,200p'
    exit 1
  }
  
  # Enable pgcrypto extension for encryption tests
  log_info "Enabling pgcrypto extension..."
  docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -h localhost -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null
  
  # Seed test data
  log_info "Seeding test database..."
  if [ -f "$PROJECT_ROOT/database/prime_test_db.sql" ]; then
    docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -h localhost -d "$POSTGRES_DB" < "$PROJECT_ROOT/database/prime_test_db.sql" 2>&1 | grep -v "^INSERT" || true
  else
    log_warn "No prime_test_db.sql found"
  fi
  
  # Create Navigator AI database
  log_info "Creating Navigator AI database..."
  DB_NAV_EXISTS=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -h localhost -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_NAV_DB'")
  if [ "$DB_NAV_EXISTS" != "1" ]; then
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -h localhost -d postgres -c "CREATE DATABASE $POSTGRES_NAV_DB;" >/dev/null
  fi
  
  # Apply Navigator AI schema
  if [ -f "$PROJECT_ROOT/database/jobtrack_navigator_ai_schema.sql" ]; then
    log_info "Applying Navigator AI schema..."
    docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -h localhost -d "$POSTGRES_NAV_DB" < "$PROJECT_ROOT/database/jobtrack_navigator_ai_schema.sql" 2>&1 | grep -E "^(ERROR|CREATE|ALTER)" || true
  else
    log_warn "No jobtrack_navigator_ai_schema.sql found"
  fi
  
  # Set environment variables for tests
  export DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:$POSTGRES_PORT/$POSTGRES_DB"
  export TEST_DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:$POSTGRES_PORT/$POSTGRES_DB"
  export NAVIGATOR_DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:$POSTGRES_PORT/$POSTGRES_NAV_DB"
  export TEST_NAVIGATOR_DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:$POSTGRES_PORT/$POSTGRES_NAV_DB"
  export NAVIGATOR_DB_NAME="$POSTGRES_NAV_DB"
  export FLASK_ENV=testing
  export FLASK_DEBUG=0
  export SECRET_KEY="test-secret-key-for-integration-tests"
  export JOBTRACK_PG_KEY="test-pg-key-for-integration-tests"

  # Run Python integration tests
  if [ "$RUN_PYTHON" = true ]; then
    log_section "Python Integration Tests"
    
    cd "$PROJECT_ROOT"
    
    log_info "Running Python integration tests..."
    if [ "$COVERAGE" = true ]; then
      pytest -v --cov=./ --cov-report=term-missing -m "integration"
    else
      pytest -v -m "integration"
    fi
    
    log_info "✅ Python integration tests completed"
    # Optionally destroy the DB container before frontend tests. By default
    # we reuse the same test DB for speed; pass `--recreate-db` to enforce a
    # recreate between Python and frontend integration stages.
    if [ "$RUN_FRONTEND" = true ] && [ "$RECREATE_DB" = true ]; then
      log_info "Recreate requested: destroying PostgreSQL container to ensure clean DB for frontend tests..."
      if docker ps -a | grep -q "$POSTGRES_CONTAINER"; then
        log_info "Stopping and removing Docker container: $POSTGRES_CONTAINER"
        docker stop "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
        docker rm "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
      fi
    else
      if [ "$RUN_FRONTEND" = true ]; then
        log_info "Reusing PostgreSQL container for frontend tests (pass --recreate-db to force recreation)"
      fi
    fi
  fi
  
  # Run Frontend integration tests
  if [ "$RUN_FRONTEND" = true ]; then
    log_section "Frontend Integration Tests"
    

    # Always recreate the PostgreSQL container for frontend integration tests
    log_info "Recreating PostgreSQL Docker container for frontend integration tests..."
    # Force remove any existing container with the same name, then create a new one
    log_info "Removing any existing container named $POSTGRES_CONTAINER (if present)"
    docker rm -f "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true

    docker run -d \
      --name "$POSTGRES_CONTAINER" \
      -e POSTGRES_USER="$POSTGRES_USER" \
      -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
      -e POSTGRES_DB="$POSTGRES_DB" \
      -p "$POSTGRES_PORT:5432" \
      "$POSTGRES_IMAGE"

    log_info "Waiting for PostgreSQL to be ready..."
    for i in {1..30}; do
      if docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" -h localhost >/dev/null 2>&1; then
        log_info "PostgreSQL is ready"
        break
      fi
      if [ $i -eq 30 ]; then
        log_error "PostgreSQL failed to start within 30 seconds"
        docker logs "$POSTGRES_CONTAINER"
        exit 1
      fi
      sleep 1
    done

    # Apply main database schema
    log_info "Applying database schema..."
    docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -h localhost -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f - < "$PROJECT_ROOT/database/schema.sql" 2>&1 | tee /tmp/schema-apply.log || {
      log_error "Applying database/schema.sql failed. See /tmp/schema-apply.log for details."
      docker logs "$POSTGRES_CONTAINER" | sed -n '1,200p'
      exit 1
    }

    # Enable pgcrypto extension for encryption tests
    log_info "Enabling pgcrypto extension..."
    docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -h localhost -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null

    # Seed test data
    log_info "Seeding test database..."
    if [ -f "$PROJECT_ROOT/database/prime_test_db.sql" ]; then
      docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -h localhost -d "$POSTGRES_DB" < "$PROJECT_ROOT/database/prime_test_db.sql" 2>&1 | grep -v "^INSERT" || true
    else
      log_warn "No prime_test_db.sql found"
    fi

    # Create Navigator AI database
    log_info "Creating Navigator AI database..."
    DB_NAV_EXISTS=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -h localhost -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_NAV_DB'")
    if [ "$DB_NAV_EXISTS" != "1" ]; then
      docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -h localhost -d postgres -c "CREATE DATABASE $POSTGRES_NAV_DB;" >/dev/null
    fi

    # Apply Navigator AI schema
    if [ -f "$PROJECT_ROOT/database/jobtrack_navigator_ai_schema.sql" ]; then
      log_info "Applying Navigator AI schema..."
      docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -h localhost -d "$POSTGRES_NAV_DB" < "$PROJECT_ROOT/database/jobtrack_navigator_ai_schema.sql" 2>&1 | grep -E "^(ERROR|CREATE|ALTER)" || true
    else
      log_warn "No jobtrack_navigator_ai_schema.sql found"
    fi

    # Set environment variables for tests (ensure they point to the recreated container)
    export DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:$POSTGRES_PORT/$POSTGRES_DB"
    export TEST_DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:$POSTGRES_PORT/$POSTGRES_DB"
    export NAVIGATOR_DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:$POSTGRES_PORT/$POSTGRES_NAV_DB"
    export TEST_NAVIGATOR_DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:$POSTGRES_PORT/$POSTGRES_NAV_DB"
    export NAVIGATOR_DB_NAME="$POSTGRES_NAV_DB"
    export FLASK_ENV=testing
    export FLASK_DEBUG=0
    export SECRET_KEY="test-secret-key-for-integration-tests"
    export JOBTRACK_PG_KEY="test-pg-key-for-integration-tests"

    # Start Flask backend
    log_info "Starting Flask backend server..."
    cd "$PROJECT_ROOT"
    
    export PORT=$FLASK_PORT
    export FLASK_ENV=testing
    
    # Start Flask and capture initial output for debugging
    python3 backend/app.py > /tmp/jobtrack-flask-test.log 2>&1 &
    FLASK_PID=$!
    
    log_info "Flask server started (PID: $FLASK_PID)"
    log_info "Flask logs: /tmp/jobtrack-flask-test.log"
    log_info "Waiting for Flask to be ready..."
    
    for i in {1..30}; do
      if curl -s "http://localhost:$FLASK_PORT/api/health" >/dev/null 2>&1; then
        log_info "Flask server is ready"
        break
      fi
      if [ $i -eq 30 ]; then
        log_error "Flask server failed to start within 30 seconds"
        exit 1
      fi
      sleep 1
    done
    
    # Run frontend integration tests
    cd "$FRONTEND_DIR"
    export VITE_API_URL="http://127.0.0.1:$FLASK_PORT"
    
    log_info "Running frontend integration tests..."
    if [ "$COVERAGE" = true ]; then
      npm run test:integration -- --coverage
    else
      npm run test:integration
    fi
    
    log_info "✅ Frontend integration tests completed"
  fi
fi

# ============================================================================
# SUMMARY
# ============================================================================

log_section "All Tests Completed Successfully ✅" 
