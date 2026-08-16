# JobTrack Makefile
# Wraps dev scripts for common workflows

VENV        = venv-m4
PYTHON      = ./$(VENV)/bin/python3
PIP         = ./$(VENV)/bin/pip

REMOTE_HOST ?= raspberrypi.local
REMOTE_USER ?= user
REMOTE_DIR  ?= ~/jobTrack
REMOTE      ?= $(REMOTE_USER)@$(REMOTE_HOST)
PI_ENV_FILE ?= .env.pi
DEV_ENV_FILE ?= .env.local
PI_BACKEND_SERVICE ?= backend
PI_DB_SERVICE ?= db
PI_SEED_SQL ?= database/seed_referencedata_and_sector.sql
PI_DUMP_FILE ?= /tmp/jobtrack_pi_sync.pgdump

# Pi DB credentials read from .env.pi at parse time
PI_POSTGRES_USER := $(shell grep -m1 '^POSTGRES_USER=' $(PI_ENV_FILE) 2>/dev/null | cut -d= -f2)
PI_POSTGRES_DB   := $(shell grep -m1 '^POSTGRES_DB='   $(PI_ENV_FILE) 2>/dev/null | cut -d= -f2)

.PHONY: help \
        dev dev-stop dev-restart dev-status dev-logs \
        frontend frontend-force \
        docker-build docker-stop docker-logs docker-ps \
        test test-unit test-py test-js test-integration test-coverage \
        lint lint-py lint-js format-py \
        db-setup db-teardown db-backup db-fresh \
        pi-setup deploy-pi deploy-pi-code sync-db-to-pi sync-db-from-pi \
        db-watermark-local db-watermark-pi db-backup-local db-backup-pi \
        clean

# ─── Help ────────────────────────────────────────────────────────────────────

help:
	@echo "JobTrack Dev Commands"
	@echo ""
	@echo "Backend (Flask dev server):"
	@echo "  make dev              Start Flask dev server (background)"
	@echo "  make dev-stop         Stop Flask dev server"
	@echo "  make dev-restart      Restart Flask dev server"
	@echo "  make dev-status       Check if server is running"
	@echo "  make dev-logs         Tail server logs"
	@echo ""
	@echo "Frontend:"
	@echo "  make frontend         Start Vite dev server"
	@echo "  make frontend-force   Start Vite dev server (force overwrite .env.local)"
	@echo ""
	@echo "Docker (prod build, local DB):"
	@echo "  make docker-build     Build prod image and run on :8080"
	@echo "  make docker-stop      Stop and remove local Docker container"
	@echo "  make docker-logs      Follow Docker container logs"
	@echo "  make docker-ps        Show running containers and URLs"
	@echo ""
	@echo "Tests:"
	@echo "  make test             Run all tests (unit + integration)"
	@echo "  make test-unit        Run unit tests only (fast, no Docker DB)"
	@echo "  make test-py          Run Python tests (unit + integration)"
	@echo "  make test-js          Run frontend tests (unit + integration)"
	@echo "  make test-integration Run integration tests only"
	@echo "  make test-coverage    Run all tests with coverage"
	@echo ""
	@echo "Linting / formatting:"
	@echo "  make lint             Run all linters (Python + frontend)"
	@echo "  make lint-py          Run Python linters (mypy, flake8, bandit)"
	@echo "  make lint-js          Run frontend linters (ESLint + tsc)"
	@echo "  make format-py        Format Python code (black + isort)"
	@echo ""
	@echo "Database (local Postgres, outside Docker):"
	@echo "  make db-setup         Create local Postgres DB + apply schema"
	@echo "  make db-teardown      Drop local Postgres DB"
	@echo "  make db-backup        Backup local Postgres DB"
	@echo "  make db-fresh         Create fresh DB stack in Docker with bootstrap user"
	@echo ""
	@echo "Raspberry Pi deploy:"
	@echo "  make pi-setup         SSH smoke test and remind about .env.pi"
	@echo "  make deploy-pi-code   Sync code + .env.pi and restart prod profile"
	@echo "  make deploy-pi        deploy-pi-code plus migrations and seed"
	@echo "  make sync-db-to-pi    Dump local DB and restore it into the Pi db container"

# ─── Backend ─────────────────────────────────────────────────────────────────

dev:
	./scripts/start-server.sh start

dev-stop:
	./scripts/start-server.sh stop

dev-restart:
	./scripts/start-server.sh restart

dev-status:
	./scripts/start-server.sh status

dev-logs:
	./scripts/start-server.sh tail

# ─── Frontend ────────────────────────────────────────────────────────────────

frontend:
	./scripts/start-frontend-dev.sh

frontend-force:
	./scripts/start-frontend-dev.sh --force

# ─── Docker (prod build) ─────────────────────────────────────────────────────

docker-build:
	./scripts/run_local_docker.sh
	@$(MAKE) --no-print-directory docker-ps

docker-stop:
	docker rm -f jobtrack_local || true

docker-logs:
	docker logs -f jobtrack_local

docker-ps:
	@echo ""
	@echo "Running containers:"
	@echo "-------------------"
	@docker ps --format "  {{.Names}}\t{{.Status}}\t{{.Ports}}" | column -t
	@echo ""
	@echo "JobTrack local:  http://localhost:8080"
	@echo ""

# ─── Tests ───────────────────────────────────────────────────────────────────

test:
	./scripts/run-tests.sh

test-unit:
	./scripts/run-tests.sh --unit

test-py:
	./scripts/run-tests.sh --python

test-js:
	./scripts/run-tests.sh --frontend

test-integration:
	./scripts/run-tests.sh --integration

test-coverage:
	./scripts/run-tests.sh --coverage

# ─── Linting / formatting ────────────────────────────────────────────────────

lint: lint-py lint-js

lint-py:
	@echo "Running mypy..."
	./$(VENV)/bin/mypy --show-error-codes --pretty .
	@echo "Running flake8..."
	./$(VENV)/bin/flake8 . --exclude=venv,venv-m4,node_modules,migrations,tools,scripts --max-line-length=88
	@echo "Running bandit..."
	./$(VENV)/bin/bandit -r . -f text --exclude ./venv,./venv-m4,./node_modules,./tools,./scripts || true

lint-js:
	npm --prefix frontend run lint || true
	npx --prefix frontend tsc --noEmit || true

format-py:
	./$(VENV)/bin/black . --exclude='(venv|venv-m4|node_modules|migrations|tools)'
	./$(VENV)/bin/isort . --skip venv --skip venv-m4 --skip node_modules --skip migrations --skip tools

# ─── Database ────────────────────────────────────────────────────────────────

db-setup:
	./scripts/setup_jobtrack_db.sh

db-fresh:
	./scripts/db_fresh_docker.sh

db-teardown:
	./scripts/teardown_jobtrack_db.sh

db-backup:
	./scripts/db-manager.sh backup

# ─── Raspberry Pi deploy ─────────────────────────────────────────────────────

pi-setup:
	@ssh $(REMOTE) 'echo "SSH OK: $$(hostname)"'
	@echo "Reminder: create $(PI_ENV_FILE) locally before running deploy targets."

deploy-pi-code:
	@test -f "$(PI_ENV_FILE)" || { echo "Error: $(PI_ENV_FILE) not found"; exit 1; }
	@ssh $(REMOTE) "mkdir -p $(REMOTE_DIR)"
	@rsync -az --delete \
		--exclude '.git/' \
		--exclude 'node_modules/' \
		--exclude 'frontend/node_modules/' \
		--exclude 'venv/' \
		--exclude 'venv-m4/' \
		--exclude '__pycache__/' \
		--exclude '*.pyc' \
		--exclude '.env.*' \
		--exclude '.mypy_cache/' \
		--exclude '.pytest_cache/' \
		--exclude '.ruff_cache/' \
		--exclude 'htmlcov/' \
		--exclude 'build/' \
		--exclude 'frontend/coverage/' \
		./ $(REMOTE):$(REMOTE_DIR)/
	@scp "$(PI_ENV_FILE)" $(REMOTE):$(REMOTE_DIR)/$(PI_ENV_FILE)
	@ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose --env-file $(PI_ENV_FILE) --profile prod up -d --build"

deploy-pi: deploy-pi-code
	@ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose --env-file $(PI_ENV_FILE) --profile prod exec -T $(PI_BACKEND_SERVICE) python /app/scripts/migrate.py up"
	@ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose --env-file $(PI_ENV_FILE) --profile prod exec -T $(PI_DB_SERVICE) sh -c 'psql -U \"\$$POSTGRES_USER\" -d \"\$$POSTGRES_DB\" -f /seed/$(PI_SEED_SQL)'"

sync-db-to-pi:
	@test -f "$(DEV_ENV_FILE)" || { echo "Error: $(DEV_ENV_FILE) not found"; exit 1; }
	@test -f "$(PI_ENV_FILE)" || { echo "Error: $(PI_ENV_FILE) not found"; exit 1; }
	@set -a && . ./$(DEV_ENV_FILE) && set +a && \
	[ -n "$$DATABASE_URL" ] || { echo "Error: DATABASE_URL not set in $(DEV_ENV_FILE)"; exit 1; } && \
	echo "Dumping local database to $(PI_DUMP_FILE)..." && \
	pg_dump -Fc "$$DATABASE_URL" > "$(PI_DUMP_FILE)"
	@echo "Uploading dump to Pi..."
	@scp "$(PI_DUMP_FILE)" $(REMOTE):$(PI_DUMP_FILE)
	@echo "Terminating active connections on Pi..."
	@ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose --env-file $(PI_ENV_FILE) --profile prod exec -T $(PI_DB_SERVICE) psql -U $(PI_POSTGRES_USER) -d postgres -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$(PI_POSTGRES_DB)' AND pid <> pg_backend_pid();\""
	@echo "Recreating Pi database..."
	@ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose --env-file $(PI_ENV_FILE) --profile prod exec -T $(PI_DB_SERVICE) psql -U $(PI_POSTGRES_USER) -d postgres -c 'DROP DATABASE IF EXISTS \"$(PI_POSTGRES_DB)\";'"
	@ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose --env-file $(PI_ENV_FILE) --profile prod exec -T $(PI_DB_SERVICE) psql -U $(PI_POSTGRES_USER) -d postgres -c 'CREATE DATABASE \"$(PI_POSTGRES_DB)\";'"
	@echo "Restoring dump..."
	@ssh $(REMOTE) "docker cp $(PI_DUMP_FILE) \$$(cd $(REMOTE_DIR) && docker compose --env-file $(PI_ENV_FILE) --profile prod ps -q $(PI_DB_SERVICE)):/tmp/jobtrack_pi_sync.pgdump"
	@ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose --env-file $(PI_ENV_FILE) --profile prod exec -T $(PI_DB_SERVICE) pg_restore --no-owner --no-privileges -U $(PI_POSTGRES_USER) -d $(PI_POSTGRES_DB) /tmp/jobtrack_pi_sync.pgdump"
	@ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose --env-file $(PI_ENV_FILE) --profile prod exec -T $(PI_DB_SERVICE) rm -f /tmp/jobtrack_pi_sync.pgdump"
	@rm -f "$(PI_DUMP_FILE)"
	@echo "Sync complete."

# ─── Pull: restore Pi prod DB -> local dev DB ────────────────────────────────

sync-db-from-pi:
	@test -f "$(DEV_ENV_FILE)" || { echo "Error: $(DEV_ENV_FILE) not found"; exit 1; }
	@test -f "$(PI_ENV_FILE)" || { echo "Error: $(PI_ENV_FILE) not found"; exit 1; }
	@[ "$(CONFIRM)" = "y" ] || { printf "⚠️  Overwrite LOCAL dev DB with Pi data? [y/N] " && read ans && [ "$$ans" = "y" ]; } || { echo "Aborted."; exit 1; }
	@echo "Dumping Pi database to $(PI_DUMP_FILE)..."
	@ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose --env-file $(PI_ENV_FILE) --profile prod exec -T $(PI_DB_SERVICE) pg_dump -Fc -U $(PI_POSTGRES_USER) -d $(PI_POSTGRES_DB)" > "$(PI_DUMP_FILE)"
	@echo "Restoring into local dev DB..."
	@set -a && . ./$(DEV_ENV_FILE) && set +a && \
	pg_restore --clean --if-exists --no-owner --no-privileges -d "$$DATABASE_URL" "$(PI_DUMP_FILE)"
	@rm -f "$(PI_DUMP_FILE)"
	@echo "Sync complete."

# ─── appHome sync-contract targets ───────────────────────────────────────────
# Read-only watermark = "how advanced" the DB is: sum of max ids across the
# append-heavy tables (all lowercase names -> no quoting needed over SSH).
JT_WM ?= SELECT COALESCE(MAX(engagementlogid),0)+COALESCE((SELECT MAX(taskid) FROM task),0)+COALESCE((SELECT MAX(leadid) FROM lead),0) FROM engagementlog

db-watermark-local:
	@set -a && . ./$(DEV_ENV_FILE) && set +a && \
	psql "$$DATABASE_URL" -tAc '$(JT_WM)'

db-watermark-pi:
	@ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose --env-file $(PI_ENV_FILE) --profile prod exec -T $(PI_DB_SERVICE) psql -U $(PI_POSTGRES_USER) -d $(PI_POSTGRES_DB) -tAc '$(JT_WM)'"

# Pre-sync backups (pg_dump -Fc). OUT= is the destination path on this Mac.
db-backup-local:
	@test -n "$(OUT)" || { echo "OUT= required"; exit 1; }
	@set -a && . ./$(DEV_ENV_FILE) && set +a && pg_dump -Fc "$$DATABASE_URL" > "$(OUT)"

db-backup-pi:
	@test -n "$(OUT)" || { echo "OUT= required"; exit 1; }
	@ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose --env-file $(PI_ENV_FILE) --profile prod exec -T $(PI_DB_SERVICE) pg_dump -Fc -U $(PI_POSTGRES_USER) -d $(PI_POSTGRES_DB)" > "$(OUT)"

# ─── Housekeeping ────────────────────────────────────────────────────────────

clean:
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	rm -rf .coverage htmlcov/ .pytest_cache/ .mypy_cache/
	rm -f bandit-report.json
