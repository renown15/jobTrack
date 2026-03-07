import json
import os
import uuid

import psycopg2
import pytest


@pytest.mark.integration
def test_signup_creates_applicant_integration(client):
    """Integration test: POST /api/auth/signup uses the real TEST_DATABASE_URL.

    This test requires `TEST_DATABASE_URL` to be set in the environment (conftest.py
    enforces this for tests marked with `integration`). The test creates a unique
    email, posts to the signup endpoint, asserts 201, and verifies the applicant
    exists in the test database. It then cleans up the created row.
    """

    test_db = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set for integration tests"

    unique_email = f"test.user+{uuid.uuid4().hex}@example.com"
    payload = {
        "name": "Integration Test User",
        "email": unique_email,
        "password": "s3cret",
    }
    resp = client.post(
        "/api/auth/signup",
        data=json.dumps(payload),
        content_type="application/json",
    )

    assert resp.status_code == 201
    body = resp.get_json()
    assert body.get("ok") is True
    applicant = body.get("applicant")
    assert applicant is not None
    new_id = applicant.get("applicantid")
    assert isinstance(new_id, int)

    # Verify the row exists in the real test DB and then clean up
    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT email FROM applicantprofile WHERE applicantid = %s", (new_id,)
            )
            row = cur.fetchone()
            assert row and row[0] == unique_email
            # cleanup
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid = %s", (new_id,)
            )
        conn.commit()
    finally:
        conn.close()


def test_signup_missing_fields_returns_400(client):
    resp = client.post(
        "/api/auth/signup",
        data=json.dumps({"name": "", "email": "", "password": ""}),
        content_type="application/json",
    )
    assert resp.status_code == 400
    body = resp.get_json()
    assert "error" in body
