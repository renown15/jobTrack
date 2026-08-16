# Pi Docker Stack Design

## Goal

Run JobTrack on a Raspberry Pi as a production-style Docker Compose stack with:

- a persistent PostgreSQL container
- a backend container built from the existing Dockerfile
- first-boot database initialization for both `jobtrack` and `jobtrack_navigator_ai`
- compatibility with `make deploy-pi` and `make sync-db-to-pi`

## Options considered

1. Keep the current single-container app deployment and require an external Postgres instance.
   - Lowest change count.
   - Rejected because it does not satisfy the requirement for a dockerised DB environment on the Pi.

2. Add a Compose stack with app + db, but leave DB bootstrap manual.
   - Simpler Compose file.
   - Rejected because first boot would still require ad hoc shell steps to create the navigator DB and load schemas.

3. Add a Compose stack with app + db and bootstrap both databases through Postgres init scripts.
   - Slightly more setup logic.
   - Chosen because it gives a repeatable first boot, keeps DB state in a Docker volume, and matches the repo's two-database architecture.

## Chosen approach

- Add a top-level `compose.yaml` with `backend` and `db` services under the `prod` profile.
- Use a named volume for PostgreSQL data persistence.
- Mount init scripts into `docker-entrypoint-initdb.d` so first boot creates `jobtrack_navigator_ai`, enables `pgcrypto`, applies the canonical schemas, and seeds reference data.
- Update the container migration path to use the repo's SQL migration manager instead of Alembic.
- Update `.env.pi` so the backend talks to the Compose `db` service over the internal Docker network.

## Trade-offs

- The init scripts only run on an empty DB volume, which is correct for bootstrap but means later schema changes still need migrations.
- The image needs access to the migration script, so the Docker build can no longer exclude the entire `scripts/` directory.
- This keeps the current two-database model instead of collapsing navigator data into the main DB.
