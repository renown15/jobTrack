# JobTrack AI Assistant Instructions

This file is a living guide for AI assistants working on JobTrack. It covers current architecture, safe-change patterns, and common task guidance.

## Architecture Overview

JobTrack is a Flask-based job search tracking application with a PostgreSQL backend and a React/TypeScript frontend (Vite).

### Repository Layout

```
jobtrack/
├── backend/
│   ├── app.py                  # Flask application entrypoint
│   ├── jobtrack_core/          # Routes, DB helpers, utilities
│   │   ├── routes/             # Blueprint route handlers (auth, contacts, etc.)
│   │   ├── db.py               # Database() context manager
│   │   └── ...
│   ├── jobtrack_navigator_ai/  # Navigator AI feature
│   ├── utils/                  # Shared utilities (encryption, export)
│   └── tests/
│       └── conftest.py         # Test fixtures and DB setup
├── frontend/                   # React + TypeScript SPA (Vite)
│   └── src/
│       ├── api/                # Typed API client
│       ├── components/         # Reusable UI components
│       ├── pages/              # Top-level route components
│       └── state/              # Shared state helpers
├── database/
│   ├── schema.sql              # Canonical DDL — primary DB source of truth
│   ├── jobtrack_navigator_ai_schema.sql
│   ├── migrations/             # Numbered SQL migration files
│   └── prime_test_db.sql       # Idempotent seed data for test DB
├── scripts/                    # Dev and ops shell scripts
├── Makefile                    # Primary dev interface — see `make help`
└── pyproject.toml              # Python deps and tool config
```

### Two Databases

| Database | Schema | Purpose |
|---|---|---|
| `jobtrack` | `database/schema.sql` | Primary application data |
| `jobtrack_navigator_ai` | `database/jobtrack_navigator_ai_schema.sql` | Navigator AI feature |

Never merge the two schemas. Apply each against its own database.

### Core Data Model

- `contact` — central entity (recruiters, applicants)
- `organisation` — companies with sector classification
- `engagementlog` — timestamped interaction history
- `jobrole` — job applications linking contacts to organisations
- `contacttargetorganisation` — many-to-many: contact target companies
- `referencedata(refid, refdataclass, refvalue)` — application enums (statuses, types)
- `sector` — reference table for organisation categorisation

## Common Commands

```bash
make help               # All available commands

# Dev servers
make dev                # Start Flask dev server (background)
make frontend           # Start Vite dev server

# Docker
make docker-build       # Build prod image, run on :8080
make docker-stop        # Remove container

# Tests
make test               # All tests
make test-unit          # Unit tests only (no DB needed)
make test-py            # Python tests
make test-js            # Frontend tests

# Linting
make lint               # All linters
make format-py          # Black + isort

# Database
make db-setup           # Create local test DB container + apply schema
make db-fresh           # Fresh DB with bootstrap admin (interactive)
make db-backup          # Backup local DB
```

Direct script equivalents:

```bash
./scripts/start-server.sh start
./scripts/run-tests.sh --python
./scripts/run-tests.sh --unit
./scripts/db-manager.sh backup|restore|status
python3 scripts/migrate.py
```

## Backend Patterns

- **DB access**: Use `Database()` from `backend/jobtrack_core/db.py`. Use `cursor_factory=RealDictCursor` for dict-like rows.
- **Transactions**: Explicit transactions for multi-statement changes. Roll back on exception and return `{"error": "message", "details": {...}}`.
- **Routes**: Thin handlers — validate input, call service/data layer, return `jsonify()`.
- **Date format**: `YYYY-MM-DD` for API dates; UTC for timestamps.
- **Applicant scoping**: Write endpoints are scoped per applicant via `/api/<applicantid>/...`.

## Frontend Patterns

- **Data fetching**: `@tanstack/react-query` hooks. Predictable cache keys: `['contacts', params]`.
- **State**: Lift filter/selection state to the page; components should be presentational.
- **UI**: MUI (`@mui/material`) components and `sx` overrides.
- **Testing**: Vitest + `@testing-library/react`. Tests use mocked API responses — no running backend needed.

## Making Safe Changes

1. Read the relevant files before proposing changes.
2. Write or update a test. Run `make test-py` (or `make test-js`) and fix failures.
3. For schema changes: create a numbered migration in `database/migrations/`, apply locally, then regenerate `database/schema.sql`.
4. Run `make lint` and `make format-py` before committing.

### Regenerating schema.sql

```bash
pg_dump --schema-only --no-owner --no-privileges --file=database/schema.sql.raw "${DATABASE_URL}"
grep -v '^\\' database/schema.sql.raw > database/schema.sql.cleaned
sed -E '/^SET transaction_timeout/d' database/schema.sql.cleaned > database/schema.sql
rm database/schema.sql.cleaned database/schema.sql.raw
```

## Operational Rules (MANDATORY)

- **Backup before overwrite**: Create a backup before overwriting `database/schema.sql` or migrations.
- **Strategic implementation**: For non-trivial changes, write a short design note describing options, trade-offs, and the chosen approach. Wait for owner approval before implementing.
- **No silent fallbacks**: Do not add automatic fallbacks or grace-paths without explicit agreement.
- **Ask when blocked**: If you cannot comply with an instruction (missing files, permissions, safety), stop and ask. Do not proceed with unilateral assumptions.
- **Own all failures**: If tests fail after your changes, investigate and fix them. All code in this repo was written by the AI agent — all issues are yours to resolve.
- **Policy**: Do not add test-only API endpoints without explicit permission from the repository owner.
