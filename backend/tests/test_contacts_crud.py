import json

import app as app_module

_ = app_module


def test_create_contact_returns_201(client, make_fake_db, monkeypatch):
    # Simulate: duplicate-check returns no row, then INSERT returns new contactid
    rules = [
        ("select contactid from contact", None),
        ("insert into contact", {"fetchone": {"contactid": 42}}),
    ]
    FakeDB = make_fake_db(rules=rules)
    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)

    payload = {"applicantid": 1, "name": "Jane Doe", "email": "jane@example.com"}
    resp = client.post(
        "/api/contacts", data=json.dumps(payload), content_type="application/json"
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body.get("contactid") == 42


def test_update_and_delete_contact(client, make_fake_db, monkeypatch):
    # Simulate SELECT existing contact, then successful update/delete
    rules = [
        ("select contactid from contact", {"fetchone": {"contactid": 5}}),
        ("update contact", {"fetchone": {"contactid": 5}}),
        ("delete from contact", {"fetchone": {"contactid": 5}}),
    ]
    FakeDB = make_fake_db(rules=rules)
    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)

    payload = {"applicantid": 1, "firstname": "Janet"}
    resp = client.put(
        "/api/contacts/5", data=json.dumps(payload), content_type="application/json"
    )
    assert resp.status_code == 200

    resp = client.delete(
        "/api/contacts/5",
        data=json.dumps({"applicantid": 1}),
        content_type="application/json",
    )
    assert resp.status_code == 200
