import os

import psycopg2
import pytest

from utils import encryption

# Mark these as integration tests so the test runner treats them accordingly.
pytestmark = pytest.mark.integration


def _get_db_url():
    return os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")


def test_usersalt_table_and_get_or_create_roundtrip():
    db_url = _get_db_url()
    applicantid = 999999
    test_salt = "test-salt-abc123"
    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            # Ensure table exists (migration should have created it)
            cur.execute("SELECT to_regclass('public.usersalt');")
            r = cur.fetchone()
            assert r and r[0] is not None, "usersalt table is missing in test DB"

            # Insert a known salt for our test applicant
            cur.execute(
                "INSERT INTO public.usersalt (applicantid, salt) VALUES (%s, %s) ON CONFLICT (applicantid) DO UPDATE SET salt = EXCLUDED.salt;",
                (applicantid, test_salt),
            )
            conn.commit()

            # Use the utils function to fetch it
            got = encryption.get_or_create_user_salt(conn, applicantid)
            assert got == test_salt


def test_fernet_encrypt_decrypt_roundtrip():
    # The project now requires DB-side encryption via `JOBTRACK_PG_KEY`.
    # Fernet app-level encryption is deprecated and not exercised here.
    pytest.skip("Fernet-based app-level encryption deprecated; skipping")
    # The project now requires DB-side encryption via `JOBTRACK_PG_KEY`.
