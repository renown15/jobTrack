import json
import os

import pytest
from typing import Any

# Optional import of psycopg2 for integration DB checks. Use `Any` so static
# checkers accept `connect` calls when the package is available; fall back
# to `None` at runtime if the package isn't installed.
psycopg2: Any = None
try:
    import psycopg2  # type: ignore
except Exception:
    psycopg2 = None


@pytest.mark.integration
def test_export_creates_document_and_allows_download(client):
    """Integration test: POST /api/export should create a document row and allow download.

    This test requires a real PostgreSQL test database configured via the
    `TEST_DATABASE_URL` environment variable. If not present the test is
    skipped so running the full unit test suite remains fast.
    """
    if not os.environ.get("TEST_DATABASE_URL"):
        pytest.skip(
            "TEST_DATABASE_URL not set; skipping integration test that uses real Postgres"
        )

    # POST to /api/export — the test client will inject applicantid into the
    # path when necessary and the session is pre-populated by the test client
    # fixture.
    res = client.post(
        "/api/export", data=json.dumps({}), content_type="application/json"
    )
    assert (
        res.status_code == 201
    ), f"Unexpected status: {res.status_code} - {res.get_data(as_text=True)}"

    payload = res.get_json()
    assert payload and isinstance(payload, dict), "Response did not contain JSON object"
    assert "documentid" in payload, f"Response missing documentid: {payload}"

    documentid = int(payload["documentid"])

    # Download the stored document binary to verify it is present and accessible
    dl = client.get(f"/api/documents/{documentid}/download")
    assert (
        dl.status_code == 200
    ), f"Download failed: {dl.status_code} - {dl.get_data(as_text=True)[:200]}"
    content_type = dl.headers.get("Content-Type", "")
    assert "application" in content_type, f"Unexpected content-type: {content_type}"
    assert dl.data and len(dl.data) > 0, "Downloaded payload was empty"

    # Verify the document row was created in the test database (integration check)
    test_db_url = os.environ.get("TEST_DATABASE_URL")
    if test_db_url and psycopg2 is not None:
        with psycopg2.connect(test_db_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT documentid FROM document WHERE documentid = %s;",
                    (documentid,),
                )
                row = cur.fetchone()
                assert (
                    row and int(row[0]) == documentid
                ), "Document row not found in test DB"
    # Cleanup: remove the created document so repeated test runs do not accumulate artifacts
    dr = client.delete(f"/api/documents/{documentid}", content_type="application/json")
    assert dr.status_code in (
        200,
        204,
    ), f"Failed to delete test document: {dr.status_code} - {dr.get_data(as_text=True)}"
