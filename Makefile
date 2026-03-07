# JobTrack Makefile
# Wraps dev scripts for common workflows

VENV        = venv-m4
PYTHON      = ./$(VENV)/bin/python3
PIP         = ./$(VENV)/bin/pip

.PHONY: help \
        dev dev-stop dev-restart dev-status dev-logs \
        frontend frontend-force \
        docker-build docker-stop docker-logs docker-ps \
        test test-unit test-py test-js test-integration test-coverage \
        lint lint-py lint-js format-py \
        db-setup db-teardown db-backup db-fresh \
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

# ─── Housekeeping ────────────────────────────────────────────────────────────

clean:
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	rm -rf .coverage htmlcov/ .pytest_cache/ .mypy_cache/
	rm -f bandit-report.json
