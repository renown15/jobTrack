# JobTrack Test Architecture

This document describes the unified test infrastructure for JobTrack, covering unit tests, integration tests, and the orchestration scripts.

## Overview

JobTrack has two categories of tests:

1. **Unit Tests** - Fast, standalone tests that don't require external dependencies
2. **Integration Tests** - Full-stack tests that require Docker PostgreSQL + Flask backend

## Test Runner Script

The main entry point is `./scripts/run-tests.sh` which provides a unified interface for all test scenarios:

```bash
# Run all tests (unit + integration, Python + Frontend)
./scripts/run-tests.sh

# Run only unit tests (fast, no Docker)
./scripts/run-tests.sh --unit

# Run only integration tests
./scripts/run-tests.sh --integration

# Run only Python tests (unit + integration)
./scripts/run-tests.sh --python

# Run only frontend tests (unit + integration)
./scripts/run-tests.sh --frontend

# Combine flags for specific scenarios
./scripts/run-tests.sh --python --unit         # Python unit tests only
./scripts/run-tests.sh --frontend --integration # Frontend integration tests only

# Additional flags
./scripts/run-tests.sh --coverage    # Enable coverage reporting
./scripts/run-tests.sh --no-cleanup  # Keep Docker container running after tests
./scripts/run-tests.sh --verbose     # Show detailed Flask server output
```

## Test Suites

### Python Unit Tests
- Location: `tests/test_*.py` (marked without `@pytest.mark.integration`)
- Run with: `./scripts/run-tests.sh --python --unit`
- No external dependencies required
- Includes mypy type checking

### Python Integration Tests
- Location: `tests/test_*.py` (marked with `@pytest.mark.integration`)
- Run with: `./scripts/run-tests.sh --python --integration`
- Requires: Docker PostgreSQL with seed data
- Tests database operations, export utilities, encryption, etc.

### Frontend Unit Tests
- Location: `frontend/tests/*.test.tsx` (excludes `integration/`)
- Run with: `./scripts/run-tests.sh --frontend --unit`
- Tests React components in isolation using jsdom
- No backend required

### Frontend Integration Tests
- Location: `frontend/tests/integration/api/*.test.ts`
- Run with: `./scripts/run-tests.sh --frontend --integration`
- Requires: Docker PostgreSQL + Flask backend
- Tests full API contract from frontend perspective

#### Integration Test Coverage:
- **Contacts API** - CRUD, target organisations, filtering
- **Organisations API** - CRUD, sectors, filtering
- **Job Roles API** - CRUD, status updates, filtering
- **Engagements API** - CRUD, date/contact filtering
- **Leads API** (`leads.py`) - CRUD, promotion to contacts
- **Tasks API** - CRUD, completion, status/date filtering
- **Documents API** - CRUD, metadata, type filtering
- **Navigator AI API** (`jobtrack_navigator_ai/`) - queries, insights, analytics
- **Analytics API** - summary stats, timelines, funnels, distributions
- **Reference Data API** - all reference data classes

## Infrastructure Details

### Docker PostgreSQL Setup

When integration tests run, the script automatically:

1. Starts `postgres:15` with pgvector extension (container: `jobtrack-test-db`)
2. Creates two databases:
   - `jobtrack_test` - main application database
   - `jobtrack_navigator_ai_test` - Navigator AI database
3. Applies schemas:
   - `database/schema.sql` → jobtrack_test
   - `database/jobtrack_navigator_ai_schema.sql` → jobtrack_navigator_ai_test
4. Seeds test data from `database/prime_test_db.sql`
5. Cleans up containers after tests (unless `--no-cleanup` specified)

### Flask Backend (for Frontend Integration Tests)

- Started automatically on port 8080
- Environment: `FLASK_ENV=testing`
- Waits for `/api/health` endpoint to be ready
- Stopped automatically after tests

### Test Data Management

- **Seed data**: `database/prime_test_db.sql` provides minimal required data
  - Test applicant (id=1)
  - Reference data (statuses, types, priorities)
  - Sectors
- **Cleanup**: Integration tests clean up their own test entities (names containing "Test" or "Integration")
- **Idempotent**: Seed file uses `ON CONFLICT DO NOTHING` for repeatability

## Configuration Files

- `frontend/vitest.config.ts` - Frontend unit test configuration
- `frontend/vitest.config.integration.ts` - Frontend integration test configuration
- `frontend/tests/integration/setup.ts` - Integration test utilities (ApiClient, lifecycle hooks)
- `database/prime_test_db.sql` - Test database seed data

## CI/CD Integration

The test script is designed for CI pipelines:

```yaml
# GitHub Actions example
- name: Run all tests
  run: ./scripts/run-tests.sh

# Or run specific suites
- name: Run unit tests
  run: ./scripts/run-tests.sh --unit --coverage

- name: Run integration tests
  run: ./scripts/run-tests.sh --integration
```

## Troubleshooting

### Docker container conflicts
If you see "port already in use" or "container already exists":
```bash
docker stop jobtrack-test-db
docker rm jobtrack-test-db
```

### Flask not starting
Check if port 8080 is in use:
```bash
lsof -i :8080
```

### Frontend integration tests failing
Verify backend is reachable:
```bash
curl http://localhost:8080/api/health
```

### Keep environment running for debugging
```bash
./scripts/run-tests.sh --integration --no-cleanup --verbose
# Docker container and Flask stay running
# Connect to DB: psql -h localhost -p 5433 -U postgres jobtrack_test
```

## Migration from Old Scripts

Previous test scripts have been consolidated:
- ~~`scripts/run-integration-tests.sh`~~ → merged into `run-tests.sh --integration`
- ~~`scripts/build_seed_test_docker.sh`~~ → logic absorbed into unified runner
- Legacy script remains for backward compatibility but should be considered deprecated

## Best Practices

1. **Run unit tests during development** - Fast feedback loop
   ```bash
   ./scripts/run-tests.sh --unit
   ```

2. **Run integration tests before committing** - Catch breaking changes
   ```bash
   ./scripts/run-tests.sh --integration
   ```

3. **Use `--no-cleanup` for debugging** - Inspect test database state
   ```bash
   ./scripts/run-tests.sh --integration --no-cleanup
   ```

4. **Mark Python tests appropriately**:
   ```python
   @pytest.mark.integration  # Requires Docker DB
   def test_database_operation():
       pass
   
   # No marker = unit test
   def test_pure_function():
       pass
   ```

5. **Keep integration tests idempotent** - Use test name prefixes for cleanup
   ```typescript
   const newContact = {
     name: 'Integration Test Contact',  // Cleaned up by test framework
     ...
   }
   ```
