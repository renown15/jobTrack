import os

import psycopg2
import pytest


@pytest.mark.integration
def test_navigator_tables_present():
    """Connect to the navigator DB and assert the expected tables exist.

    The test uses the `TEST_NAVIGATOR_DATABASE_URL` environment variable if set,
    otherwise falls back to `postgresql://postgres@localhost:5432/jobtrack_navigator_ai`.
    """
    dsn = os.getenv(
        "TEST_NAVIGATOR_DATABASE_URL",
        os.getenv(
            "NAVIGATOR_DATABASE_URL",
            "postgresql://postgres@localhost:5432/jobtrack_navigator_ai",
        ),
    )

    expected = {"applicantmetrichistory", "embedding_1024", "emeddings", "llmprompts"}

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename IN %s",
                (tuple(expected),),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    found = {r[0] for r in rows}
    missing = expected - found
    assert not missing, f"Missing navigator tables: {sorted(missing)}"
