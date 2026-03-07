# JobTrack — Developer Guide

JobTrack is a Flask + React job search tracker. The backend is a Flask REST API backed by PostgreSQL; the frontend is a React/TypeScript SPA built with Vite.

## Quick Start

```bash
# See all available dev commands
make help
```

The `Makefile` wraps all scripts. Use `make` commands rather than calling scripts directly.

## Repository Layout

```
jobtrack/
├── backend/                   # Flask application
│   ├── app.py                 # Application entrypoint (Flask factory)
│   ├── jobtrack_core/         # Core modules: routes, DB helpers, utils
│   │   ├── routes/            # Blueprint route handlers
│   │   ├── db.py              # Database() context manager
│   │   └── ...
│   ├── jobtrack_navigator_ai/ # Navigator AI feature module
│   ├── utils/                 # Shared utilities (encryption, export)
│   └── tests/                 # pytest test suite
│       └── conftest.py        # Fixtures and DB setup
├── frontend/                  # React + TypeScript SPA (Vite)
│   ├── src/
│   │   ├── api/               # Typed API client
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/             # Top-level route components
│   │   └── state/             # Shared state helpers
│   └── dist/                  # Built output (served by Flask in production)
├── database/
│   ├── schema.sql             # Canonical DDL — source of truth for DB structure
│   ├── migrations/            # Numbered SQL migration files
│   └── README.md              # Database management guide
├── scripts/                   # Dev and ops shell scripts
├── Makefile                   # Primary dev interface
├── Dockerfile                 # Multi-stage prod build (frontend + backend)
└── pyproject.toml             # Python dependencies and tool config
```

## Running Locally

### Backend (Flask dev server)

```bash
make dev          # Start Flask dev server in background
make dev-logs     # Tail server logs
make dev-stop     # Stop server
make dev-status   # Check if running
```

The dev server reads environment from `.env.local`. Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JOBTRACK_PG_KEY` | Encryption key for pgcrypto operations |
| `SECRET_KEY` | Flask session secret |

### Frontend (Vite dev server)

```bash
make frontend        # Start Vite dev server
make frontend-force  # Start and overwrite .env.local
```

Vite proxies `/api` to the Flask backend. Both servers must be running for full local dev.

### Production Docker build (local)

```bash
make docker-build   # Build image, run container on :8080
make docker-logs    # Follow container logs
make docker-stop    # Remove container
make docker-ps      # Show running containers and URLs
```

## Database

Two PostgreSQL databases are used:

- **`jobtrack`** — primary application database. Schema: `database/schema.sql`. Migrations: `database/migrations/`.
- **`jobtrack_navigator_ai`** — Navigator AI auxiliary database. Schema: `database/jobtrack_navigator_ai_schema.sql`.

### Set up a fresh local test DB

```bash
make db-setup    # Creates a Docker Postgres container and applies schema
make db-teardown # Removes the container
make db-fresh    # Creates a fresh DB with bootstrap admin user (interactive)
make db-backup   # Backup the local DB
```

### Schema conventions

- `database/schema.sql` is the canonical DDL. Keep it in sync after migrations.
- Add numbered SQL files to `database/migrations/` for every schema change.
- Use `INSERT ... ON CONFLICT DO NOTHING` in seed scripts for idempotency.
- Prefer nullable columns first when adding `NOT NULL` data that may break older code.

### Regenerating schema.sql from a live database

```bash
pg_dump --schema-only --no-owner --no-privileges --file=database/schema.sql.raw "${DATABASE_URL}"
grep -v '^\\' database/schema.sql.raw > database/schema.sql.cleaned
sed -E '/^SET transaction_timeout/d' database/schema.sql.cleaned > database/schema.sql
rm database/schema.sql.cleaned database/schema.sql.raw
```

### Migrations

```bash
python3 scripts/migrate.py          # Apply pending migrations
./scripts/db-manager.sh backup      # Backup before destructive changes
./scripts/db-manager.sh restore <file>
./scripts/db-manager.sh status
```

## Tests

```bash
make test             # All tests (Python + frontend)
make test-unit        # Unit tests only (no DB required)
make test-py          # Python tests only
make test-js          # Frontend tests only
make test-integration # Integration tests only
make test-coverage    # All tests with coverage report
```

Tests use `pytest`. Fixtures and DB setup are in `backend/tests/conftest.py`. Integration tests require a running test DB — use `make db-setup` first.

The test suite sets `JOBTRACK_PG_KEY` automatically via `conftest.py` so pgcrypto tests work without manual environment setup.

## Linting and Formatting

```bash
make lint       # Run all linters (mypy + flake8 + bandit + ESLint + tsc)
make lint-py    # Python only
make lint-js    # Frontend only
make format-py  # Auto-format Python (black + isort)
```

CI enforces all of these. Run `make lint` and `make format-py` before pushing.

## Architecture & Patterns

### Backend

- **Entrypoint**: `backend/app.py` — Flask app factory, registers blueprints.
- **DB access**: Use the `Database()` context manager from `backend/jobtrack_core/db.py`. Use `cursor_factory=RealDictCursor` when dict-like rows are needed.
- **Transactions**: Open explicit transactions when changes span multiple statements. Roll back on exception and return `{ "error": "message", "details": {...} }`.
- **Routes**: Keep handlers thin — validate input, call a service or data layer, return `jsonify()`.
- **Date format**: `YYYY-MM-DD` for API dates; UTC for timestamps.

### Frontend

- **Framework**: Vite + React + TypeScript.
- **UI**: MUI (`@mui/material`) components and theming.
- **Server state**: `@tanstack/react-query` for data fetching, caching and invalidation.
- **API client**: `frontend/src/api/client.ts` — typed fetchers for all backend endpoints.
- **Patterns**: Thin pages with data logic in hooks; keep components presentational.

See `frontend/README.md` for frontend-specific testing and conventions.

## Logging

| Variable | Effect |
|---|---|
| `JOBTRACK_LOGFILE` | Write rotating logs to this path (10 MB, 5 backups) |
| `LOG_LEVEL` | Log level — defaults to `INFO` |

Omit `JOBTRACK_LOGFILE` in Docker so logs go to stdout and appear in `docker logs`.

## Operational Notes

- Backup `database/schema.sql` before overwriting.
- Make migrations small and focused.
- Keep `referencedata` migrations in sync with code that expects new enum values.
- Do not add test-only API endpoints without explicit permission from the repository owner.

## Where to Start

1. `backend/app.py` — Flask factory and blueprint registration.
2. `backend/jobtrack_core/routes/` — Route handlers by feature area.
3. `backend/tests/conftest.py` — Test fixtures and DB setup.
4. `database/schema.sql` — Full database schema.
5. `make help` — All available dev commands.
