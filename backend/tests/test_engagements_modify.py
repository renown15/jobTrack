import json

import app as app_module

_ = app_module


def test_create_engagement_returns_201(client, make_fake_db, monkeypatch):
    """POST /api/engagements should insert and return the created engagement id."""

    # Return contact existence for validation, and then the inserted engagement id
    rules = [
        ("select refid from referencedata", {"fetchone": {"refid": 101}}),
        ("select contactid, name from contact", {"fetchone": {"contactid": 2}}),
        ("insert into engagementlog", {"fetchone": {"engagementlogid": 88}}),
    ]
    FakeDB = make_fake_db(rules=rules)
    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)

    payload = {
        "applicantid": 1,
        "contact_id": 2,
        "log_date": "2025-12-01",
        "log_entry": "Called about role",
    }
    resp = client.post(
        "/api/1/engagements", data=json.dumps(payload), content_type="application/json"
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body.get("engagementlogid") == 88 or body.get("logid") == 88


def test_update_and_delete_engagement(client, make_fake_db, monkeypatch):
    """PUT and DELETE engagement endpoints should succeed when engagement exists."""

    # Rules: engagement exists, contact exists for updates, update/delete return success
    # Match the actual SQL used by the handler:
    # - existence check: SELECT engagementlogid FROM engagementlog WHERE engagementlogid = %s AND applicantid = %s LIMIT 1;
    # - contact existence: SELECT contactid FROM Contact WHERE contactid = %s AND applicantid = %s LIMIT 1;
    rules = [
        ("select refid from referencedata", {"fetchone": {"refid": 101}}),
        (
            "from engagementlog where engagementlogid",
            {"fetchone": {"engagementlogid": 7}},
        ),
        ("select contactid, name from contact", {"fetchone": {"contactid": 2}}),
        ("update engagementlog", {"fetchone": {"engagementlogid": 7}}),
        ("delete from engagementlog", {"fetchone": {"engagementlogid": 7}}),
    ]
    FakeDB = make_fake_db(rules=rules)
    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)

    payload = {
        "applicantid": 1,
        "contact_id": 2,
        "log_date": "2025-12-02",
        "log_entry": "Updated note",
    }
    resp = client.put(
        "/api/1/engagements/7",
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert resp.status_code == 200

    resp = client.delete(
        "/api/1/engagements/7",
        data=json.dumps({"applicantid": 1}),
        content_type="application/json",
    )
    assert resp.status_code == 200
