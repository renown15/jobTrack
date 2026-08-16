import json

import app as app_module

_ = app_module


def test_add_jobrole_creates_jobrole(client, make_fake_db, monkeypatch):
    """POST /api/jobroles should create organisation (when missing) and return jobid."""

    def fetchone(last_query):
        q = (last_query or "").lower()
        # Contact exists
        if "select contactid from contact" in q:
            return {"contactid": 10}
        # No existing organisation found by name
        if "select orgid from organisation where lower(name)" in q:
            return None
        # INSERT INTO organisation ... RETURNING orgid
        if q.strip().startswith("insert into organisation"):
            return {"orgid": 321}
        # Default status lookup
        if (
            "select refid from referencedata where refdataclass = 'application_status'"
            in q
        ):
            return {"refid": 7}
        # INSERT INTO jobrole ... RETURNING jobid
        if q.strip().startswith("insert into jobrole"):
            return {"jobid": 999}
        return None

    FakeDB = make_fake_db(fetchone=fetchone)
    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)

    payload = {
        "applicantid": 1,
        "contactid": 10,
        "rolename": "Senior Engineer",
        "company_name": "Acme Widgets",
        "statusid": 7,
    }

    resp = client.post(
        "/api/jobroles", data=json.dumps(payload), content_type="application/json"
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)
    body = resp.get_json()
    assert body.get("jobid") == 999


def test_add_jobrole_contact_not_found_returns_404(client, make_fake_db, monkeypatch):
    """When provided contactid does not exist, endpoint returns 404."""

    def fetchone_none_contact(last_query):
        q = (last_query or "").lower()
        if "select contactid from contact" in q:
            return None
        return None

    FakeDB = make_fake_db(fetchone=fetchone_none_contact)
    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)

    payload = {
        "applicantid": 1,
        "contactid": 9999,
        "rolename": "Engineer",
        "statusid": 7,
    }
    resp = client.post(
        "/api/jobroles", data=json.dumps(payload), content_type="application/json"
    )
    assert resp.status_code == 404
    assert resp.get_json().get("error") == "Contact not found"
