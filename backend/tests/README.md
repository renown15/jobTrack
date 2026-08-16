# Tests: Using a seeded applicantid

Integration tests that operate against a real, seeded test database should not hardcode an `applicantid` value. Tests can discover a valid seeded `applicantid` at runtime by connecting to the test database and querying `applicantprofile`.

Why this pattern

- CI and local seed data may use different applicant ids; hardcoding `1` can cause fragile tests.
- Discovering a seeded id at runtime makes tests portable across environments.

How to use it (example)

```py
# inside a pytest integration test
import os
import psycopg2

db_url = os.environ.get('TEST_DATABASE_URL') or os.environ.get('DATABASE_URL')
if not db_url:
    pytest.skip('Requires TEST_DATABASE_URL')

with psycopg2.connect(db_url) as conn:
    with conn.cursor() as cur:
        cur.execute('SELECT applicantid FROM applicantprofile LIMIT 1;')
        row = cur.fetchone()
        applicantid = int(row[0]) if row and row[0] else 1

# use applicantid in API paths
resp = client.post(f"/api/{applicantid}/contacts", json={"name": "Test"})
```

Notes

- Ensure `TEST_DATABASE_URL` points at a DB that has been seeded with the canonical schema and at least one `applicantprofile` row.
- Prefer `psycopg2` for direct DB queries in tests; skip DB verification if `psycopg2` is unavailable in the test runner.
- Keep secrets (DB URLs, encryption keys) out of source control: set them as environment variables or use a secret manager.
