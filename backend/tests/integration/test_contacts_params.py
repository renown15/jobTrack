import re

import pytest

# This integration test ensures the contacts endpoint correctly applies the
# org_id parameter and does not mis-order SQL parameters (regression test
# for earlier bug where params were reordered and applicantid received
# the org id).

# The test assumes a running test app fixture `client` that points to a
# deterministic test database seeded with known data. Adjust fixtures if
# your test harness uses a different name.


@pytest.mark.integration
def test_contacts_with_org_id_returns_contacts(client):
    # Retrieve all contacts and pick a current org id from seeded data.
    resp_all = client.get("/api/1/contacts")
    assert resp_all.status_code == 200
    all_data = resp_all.get_json()
    assert isinstance(all_data, list)
    assert len(all_data) > 0, "Test seed contains no contacts"

    # Find a contact with a non-null currentorgid to test filtering by org_id
    org_id = None
    for c in all_data:
        try:
            cid = int(c.get("currentorgid") or 0)
        except Exception:
            cid = 0
        if cid:
            org_id = cid
            break
    assert org_id is not None, "No contact in seed has a currentorgid to test with"

    resp = client.get(f"/api/1/contacts?org_id={org_id}")
    assert resp.status_code == 200
    data = resp.get_json()
    # Expect a non-empty list for this org in test seed
    assert isinstance(data, list)
    assert len(data) > 0, f"Expected contacts for org_id={org_id} but got none"

    # Sanity-check fields on first item to ensure query returned contact rows
    first = data[0]
    assert "contactid" in first
    assert "currentorgid" in first
    # currentorgid should match org_id for at least one returned row
    assert any((int(item.get("currentorgid") or 0) == org_id) for item in data)


@pytest.mark.integration
def test_contacts_org_id_does_not_set_applicantid_in_sql(client, caplog):
    """
    Extra safety test: hit the endpoint and inspect logs to ensure
    the SQL logged uses the correct applicantid placeholder and the org id
    appears where expected. This relies on the app logging the SQL via
    cursor.mogrify (added in app.py). If logging is disabled in test,
    this assertion is a no-op but the primary behavior is validated by
    the previous test.
    """
    org_id = 537
    caplog.clear()
    resp = client.get(f"/api/1/contacts?org_id={org_id}")
    assert resp.status_code == 200

    # Look for the logged SQL in caplog records
    sql_logs = [
        r.message
        for r in caplog.records
        if "CONTACTS API" in r.message and "Executing SQL" in r.message
    ]
    if not sql_logs:
        pytest.skip(
            "SQL logging not present in test logs; skipping SQL text assertions"
        )

    # Inspect the first logged SQL for obvious misplacement: applicantid should be '= 1' (since path is /api/1/contacts)
    sql_text = """""".join(sql_logs)
    assert re.search(
        r"WHERE\s+c\.applicantid\s*=\s*1", sql_text
    ), "applicantid placeholder not 1 in logged SQL"
    assert re.search(r"targetid\s*=\s*%s" % org_id, sql_text) or re.search(
        r"ct\.targetid\s*=\s*%s" % org_id, sql_text
    ), "org_id not found in logged SQL"
