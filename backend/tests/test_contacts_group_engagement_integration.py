import datetime
import json
import os
import uuid
from typing import Any

import pytest

# Optional psycopg2 for DB lookups in integration tests
psycopg2: Any
try:
    import psycopg2  # type: ignore
except Exception:
    psycopg2 = None


@pytest.mark.integration
def test_contacts_api_attributes_group_engagements(monkeypatch, client):
    """Integration test:

    - Create two contacts via the API
    - POST an engagement with `contact_ids` containing both contacts (should create a group)
    - Verify GET /api/<applicantid>/contacts attributes the engagement to each member

    Notes:
    - Requires TEST_DATABASE_URL to be set for a real DB; otherwise the test is skipped.
    """

    test_db_url = os.environ.get("TEST_DATABASE_URL")
    if not test_db_url:
        pytest.skip("TEST_DATABASE_URL not set; skipping DB integration test")

    # Determine a seeded applicantid from the test DB if possible
    if not psycopg2:
        applicantid = 1
    else:
        try:
            with psycopg2.connect(test_db_url) as _conn:
                with _conn.cursor() as _cur:
                    _cur.execute(
                        "SELECT applicantid FROM public.applicantprofile LIMIT 1;"
                    )
                    row = _cur.fetchone()
                    applicantid = int(row[0]) if row and row[0] else 1
        except Exception:
            applicantid = 1

    # Create two contacts
    name1 = "Integration Test Contact A " + uuid.uuid4().hex[:6]
    name2 = "Integration Test Contact B " + uuid.uuid4().hex[:6]
    resp1 = client.post(f"/api/{applicantid}/contacts", json={"name": name1})
    assert resp1.status_code in (200, 201), resp1.get_data(as_text=True)
    contactid1 = resp1.get_json().get("contactid")

    resp2 = client.post(f"/api/{applicantid}/contacts", json={"name": name2})
    assert resp2.status_code in (200, 201), resp2.get_data(as_text=True)
    contactid2 = resp2.get_json().get("contactid")

    assert contactid1 and contactid2 and contactid1 != contactid2

    # Create an engagement that references both contacts (this should create/reuse a contactgroup)
    today = datetime.date.today().isoformat()
    plaintext = "Integration group engagement " + uuid.uuid4().hex[:8]
    payload = {
        "contact_ids": [contactid1, contactid2],
        "log_date": today,
        "log_entry": plaintext,
    }
    # Ensure passphrase available for DB-side encryption
    monkeypatch.setenv("JOBTRACK_PG_KEY", "test-integration-passphrase")

    resp3 = client.post(
        f"/api/{applicantid}/engagements",
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert resp3.status_code == 201, resp3.get_data(as_text=True)

    # Now fetch contacts list and assert each contact shows the engagement
    # Use from_date/to_date to narrow the aggregation window
    list_resp = client.get(
        f"/api/{applicantid}/contacts?from_date={today}&to_date={today}"
    )
    assert list_resp.status_code == 200, list_resp.get_data(as_text=True)
    contacts = list_resp.get_json()
    assert isinstance(contacts, list)

    # Find our two contacts and assert engagement_count and last_contact_date
    found1 = next((c for c in contacts if c.get("contactid") == contactid1), None)
    found2 = next((c for c in contacts if c.get("contactid") == contactid2), None)
    assert found1 is not None, f"Contact {contactid1} not found in contacts list"
    assert found2 is not None, f"Contact {contactid2} not found in contacts list"

    # Engagement count should be >=1 and last_contact_date should match today
    assert int(found1.get("engagement_count", 0)) >= 1
    assert int(found2.get("engagement_count", 0)) >= 1
    assert (found1.get("last_contact_date") or "")[:10] == today
    assert (found2.get("last_contact_date") or "")[:10] == today

    # Optionally verify the engagement appears in the engagements API and references a group
    eng_resp = client.get(f"/api/{applicantid}/engagements?limit=20")
    assert eng_resp.status_code == 200, eng_resp.get_data(as_text=True)
    engagements = eng_resp.get_json()
    # Ensure at least one engagement with our plaintext is present
    match = None
    for e in engagements:
        txt = e.get("notes") or e.get("logentry") or ""
        if txt == plaintext:
            match = e
            break
    assert match is not None, "Created engagement not present in engagements listing"
