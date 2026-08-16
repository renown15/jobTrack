import base64
import datetime
import json

import os
import uuid
from typing import Any

import pytest

# psycopg2 is optional for local test runs; allow tests to skip DB steps if unavailable
# Pre-declare the name with a permissive type so static type checkers accept
psycopg2: Any
try:
    import psycopg2  # type: ignore
except Exception:
    psycopg2 = None


@pytest.mark.integration
def test_engagement_is_encrypted_in_db(monkeypatch, client):
    """Integration test:

    - Sets `JOBTRACK_PG_KEY` so the app stores engagement `logentry` using
      `pgp_sym_encrypt(..., JOBTRACK_PG_KEY)` (base64-encoded in the DB).
    - Creates a contact and an engagement via the Flask test `client`.
    - Reads the `engagementlog.logentry` column directly from the DB and
      asserts it does NOT equal the plaintext submitted.
    - Verifies the API `GET /api/<applicantid>/engagements` returns the
      decrypted plaintext to callers.

    Notes:
    - Requires `TEST_DATABASE_URL` to be set in the environment and a
      test DB seeded with the canonical schema including `pgcrypto`.
        - Ensure `JOBTRACK_PG_KEY` is set to exercise DB-side encryption.
    """

    # Use DB-side encryption for this test (pgcrypto). Any passphrase works
    # for the purpose of verifying the stored value is not plaintext.
    monkeypatch.setenv("JOBTRACK_PG_KEY", "test-integration-passphrase")

    test_db_url = os.environ.get("TEST_DATABASE_URL")
    if not test_db_url:
        pytest.skip("TEST_DATABASE_URL not set; skipping DB integration test")

    # Discover a seeded applicantid from the test DB so tests don't hardcode ids
    if not psycopg2:
        applicantid = 1
    else:
        try:
            with psycopg2.connect(test_db_url) as _conn:
                with _conn.cursor() as _cur:
                    _cur.execute("SELECT applicantid FROM applicantprofile LIMIT 1;")
                    _row = _cur.fetchone()
                    applicantid = int(_row[0]) if _row and _row[0] else 1
        except psycopg2.Error:
            # If DB query fails for any reason, fall back to applicantid=1
            applicantid = 1

    # Create a contact (API returns contactid)
    contact_name = "Test Contact Encryption " + uuid.uuid4().hex[:8]
    # Create a contact without a current organisation to avoid inserting an
    # organisation row without applicant scoping (some schemas require
    # organisation.applicantid NOT NULL).
    resp = client.post(f"/api/{applicantid}/contacts", json={"name": contact_name})
    assert resp.status_code == 201, resp.get_data(as_text=True)
    contactid = resp.get_json().get("contactid")
    assert contactid is not None

    # Create an engagement with a unique plaintext
    plaintext = "secret-note-" + uuid.uuid4().hex
    today = datetime.date.today().isoformat()
    resp2 = client.post(
        f"/api/{applicantid}/engagements",
        json={"contactid": contactid, "logdate": today, "logentry": plaintext},
    )
    assert resp2.status_code == 201, resp2.get_data(as_text=True)
    engagementid = resp2.get_json().get("engagementlogid")
    assert engagementid is not None

    # Direct DB verify: stored value should not equal plaintext
    if not psycopg2:
        pytest.skip(
            "psycopg2 not available in test environment; skipping DB verification"
        )
    try:
        with psycopg2.connect(test_db_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT logentry FROM engagementlog WHERE engagementlogid = %s LIMIT 1;",
                    (engagementid,),
                )
                row = cur.fetchone()
                assert row is not None, "engagement row not found in DB"
                stored = row[0]
                # Ensure the DB-stored value is not the plaintext
                assert stored != plaintext
                # Expect pgcrypto branch to store base64-encoded cipher text
                try:
                    base64.b64decode(stored, validate=True)
                    is_base64 = True
                except Exception:
                    is_base64 = False
                assert is_base64, "Expected base64-encoded stored value from pgcrypto"
    except psycopg2.Error:
        pytest.skip("Unable to query test DB; skipping DB verification")

    # Ensure the API returns the decrypted text when listing engagements
    resp3 = client.get(f"/api/{applicantid}/engagements?contact_id={contactid}")
    assert resp3.status_code == 200, resp3.get_data(as_text=True)
    data = resp3.get_json()
    assert isinstance(data, list)
    found = False
    for e in data:
        # The endpoint may use `engagementlogid` or `logid` as the id field
        eid = e.get("engagementlogid") or e.get("logid")
        if eid == engagementid:
            # `logentry` or `notes` should contain the plaintext after decryption
            assert e.get("logentry") == plaintext or e.get("notes") == plaintext
            found = True
            break

    assert found, "Created engagement not returned by /engagements"


@pytest.mark.integration
def test_engagement_log_is_encrypted_in_db_and_decrypted_by_api(client):
    """Create an engagement via the API, read the DB directly and ensure the
    stored `logentry` does not equal the plaintext, then verify the API
    returns the decrypted value.
    """
    # Determine DB URL for direct queries
    db_url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not db_url:
        pytest.skip(
            "TEST_DATABASE_URL or DATABASE_URL not set; skipping integration test"
        )

    # Discover a suitable applicantid and contactid from the test DB
    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT applicantid FROM applicantprofile LIMIT 1;")
            row = cur.fetchone()
            applicantid = int(row[0]) if row and row[0] else 1

            cur.execute(
                "SELECT contactid FROM contact WHERE applicantid = %s LIMIT 1;",
                (applicantid,),
            )
            crow = cur.fetchone()
            if not crow:
                pytest.skip(
                    "No contact found for applicantid in test DB; ensure seeds are present"
                )
            contact_id = int(crow[0])

    # Use a distinct plaintext so test is robust to multiple runs
    plaintext = "Integration test secret note: do not match" + str(
        datetime.date.today()
    )

    payload = {
        "contact_id": contact_id,
        "log_date": datetime.date.today().isoformat(),
        "log_entry": plaintext,
    }
    resp = client.post(
        f"/api/{applicantid}/engagements",
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)
    body = resp.get_json()
    engagement_id = body.get("engagementlogid") or body.get("logid")
    assert engagement_id, "Expected engagement id in response"

    # Read the raw stored value from the DB and ensure it does NOT match plaintext
    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT logentry FROM engagementlog WHERE engagementlogid = %s LIMIT 1;",
                (engagement_id,),
            )
            r = cur.fetchone()
            assert r is not None, "Inserted engagement not found in DB"
            stored = r[0]
            # Stored value must not equal plaintext (i.e. it should be encrypted/encoded)
            assert stored != plaintext

    # Verify the API returns the decrypted text
    list_resp = client.get(f"/api/{applicantid}/engagements?limit=50")
    assert list_resp.status_code == 200
    engagements = list_resp.get_json()
    found = None
    for e in engagements:
        try:
            if int(e.get("engagementlogid") or e.get("logid")) == int(engagement_id):
                found = e
                break
        except Exception:
            continue
    assert found is not None, "Created engagement not present in API listing"
    # API normalizes notes/logentry; prefer 'notes'
    api_text = found.get("notes") or found.get("logentry")
    assert api_text == plaintext
