import os
import urllib.parse

import psycopg2
import pytest

import jobtrack_navigator_ai as navigator


def _nav_dsn_from_test_db():
    test_db = os.getenv("TEST_DATABASE_URL")
    if not test_db:
        # sensible default used by the repository uberscript
        test_db = "postgresql://postgres:postgres@localhost:5433/jobtrack_test"
    parsed = urllib.parse.urlparse(test_db)
    user = parsed.username or "postgres"
    password = parsed.password or ""
    host = parsed.hostname or "localhost"
    port = parsed.port or 5433
    nav_name = os.getenv("NAVIGATOR_DB_NAME", "jobtrack_navigator_ai")
    return f"postgresql://{user}:{password}@{host}:{port}/{nav_name}"


@pytest.mark.integration
def test_load_base_prompt_roundtrip():
    """Insert a BASE_PROMPT into the navigator DB and ensure the module returns it."""
    dsn = _nav_dsn_from_test_db()
    # connect and insert row
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO public.llmprompts (promptname, promptvalue) VALUES (%s, %s) ON CONFLICT (promptname) DO UPDATE SET promptvalue = EXCLUDED.promptvalue",
                ("BASE_PROMPT", "hello-navigator"),
            )
            conn.commit()
        # call module function; it uses app.DB_CONFIG + NAVIGATOR_DB_NAME env to connect
        got = navigator._load_base_prompt(1)
        assert got == "hello-navigator"
    finally:
        # cleanup - remove the inserted prompt
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM public.llmprompts WHERE promptname = %s", ("BASE_PROMPT",)
            )
            conn.commit()
        conn.close()
