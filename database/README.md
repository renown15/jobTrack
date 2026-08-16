# JobTrack Database

This directory contains all database schema and migration files for JobTrack.

## Directory Structure

```
database/
├── schema.sql                        # Canonical DDL — source of truth
├── jobtrack_navigator_ai_schema.sql  # Navigator AI auxiliary DB schema
├── prime_test_db.sql                 # Idempotent seed data for test DB
├── migrations/                       # Numbered SQL migration files
│   ├── 001_initial_schema.sql
│   ├── 002_create_contact_target_organisations.sql
│   └── ...
└── README.md                         # This file
```

## Two Databases

JobTrack uses two PostgreSQL databases:

| Database | Schema file | Purpose |
|---|---|---|
| `jobtrack` | `database/schema.sql` | Primary application data |
| `jobtrack_navigator_ai` | `database/jobtrack_navigator_ai_schema.sql` | Navigator AI feature |

Keep them separate when importing schema or running seeds — never mix the two schema files.

## Core Tables

- **`sector`** — Reference table for organisation categorisation
- **`organisation`** — Companies with sector classification
- **`contact`** — Central entity for people (recruiters and applicants)
- **`applicantprofile`** — Extended profile (1:1 with contact)
- **`engagementlog`** — Timestamped interaction history
- **`jobrole`** — Job applications linking contacts to organisations
- **`contacttargetorganisation`** — Many-to-many: contact target companies
- **`referencedata`** — Application enums (roles, statuses, engagement types)

### Key Relationships

- `contact.currentorgid` → `organisation.orgid`
- `organisation.sectorid` → `sector.sectorid`
- `engagementlog.contactid` → `contact.contactid`
- `jobrole.contactid` → `contact.contactid`
- `jobrole.companyorgid` → `organisation.orgid`

## Common Operations

### Set up a fresh local test DB

```bash
make db-setup       # Creates Docker Postgres container, applies schema
make db-teardown    # Removes the container
make db-fresh       # Interactive: creates DB + bootstrap admin user
make db-backup      # Backup the local DB
```

Or directly:

```bash
./scripts/setup_jobtrack_db.sh
./scripts/teardown_jobtrack_db.sh
./scripts/db_fresh_docker.sh
./scripts/db-manager.sh backup
./scripts/db-manager.sh restore <backup-file>
./scripts/db-manager.sh status
```

### Run migrations

```bash
python3 scripts/migrate.py
```

### Apply Navigator AI schema

```bash
psql -d jobtrack_navigator_ai -f database/jobtrack_navigator_ai_schema.sql
```

## Adding Schema Changes

1. Create a numbered migration file in `database/migrations/` following the existing scheme (e.g. `042_add_email_preferences.sql`).
2. Write idempotent SQL where possible (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, etc.).
3. Apply locally and verify.
4. Regenerate `database/schema.sql` from the updated database (see below).

## Regenerating schema.sql

After migrations, update the canonical schema file:

```bash
# 1. Dump schema only
pg_dump --schema-only --no-owner --no-privileges --file=database/schema.sql.raw "${DATABASE_URL}"

# 2. Strip psql meta-commands and version-specific SET lines
grep -v '^\\' database/schema.sql.raw > database/schema.sql.cleaned
sed -E '/^SET transaction_timeout/d' database/schema.sql.cleaned > database/schema.sql
rm database/schema.sql.cleaned database/schema.sql.raw
```

Keep `database/schema.sql` as pure DDL — no psql meta-commands, no version-specific `SET` lines — so it can be applied portably against any Postgres 14+ instance.

## Test DB Seed Data

`database/prime_test_db.sql` contains idempotent seed rows needed for integration tests (e.g. an `applicantprofile` row with `applicantid=1`). Run it after the schema:

```bash
psql -U postgres -d jobtrack_test -f database/schema.sql
psql -U postgres -d jobtrack_test -f database/prime_test_db.sql
```

## Sequence Management

When creating tables, follow the existing convention: create sequences explicitly and set `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT nextval(...)`. Do not rely solely on `SERIAL` shorthand.

## Backup Policy

- Always backup before destructive operations: `make db-backup`
- Backups are stored in `database/backups/` (not committed to git)
- The `db-manager.sh status` command shows table sizes and row counts
