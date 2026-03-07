import json

import app as app_module

_ = app_module


def test_update_jobrole_changes_rolename(client, make_fake_db, monkeypatch):
    """PUT /api/jobroles/<jobid> should update the rolename and return 200."""

    def seq1(query):
        q = (query or "").lower()
        # First execute: SELECT jobid ... should find the job
        if q.strip().startswith("select jobid from jobrole"):
            return {"fetchone": {"jobid": 123}}
        return None

    def seq2(query):
        q = (query or "").lower()
        # Second execute: UPDATE jobrole ... RETURNING jobid
        if q.strip().startswith("update jobrole"):
            return {"fetchone": {"jobid": 123}}
        return None

    FakeDB = make_fake_db(sequence=[seq1, seq2])
    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)

    payload = {"applicantid": 1, "rolename": "Updated Title"}
    # Call the explicit app route for update
    resp = client.put(
        "/api/jobroles/123", data=json.dumps(payload), content_type="application/json"
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body.get("jobid") == 123


def test_delete_jobrole_returns_200(client, make_fake_db, monkeypatch):
    """DELETE /api/jobroles/<jobid> should remove the job and return 200."""

    def seq1(query):
        q = (query or "").lower()
        if q.strip().startswith("select jobid from jobrole"):
            return {"fetchone": {"jobid": 555}}
        return None

    def seq2(query):
        q = (query or "").lower()
        if q.strip().startswith("delete from jobrole"):
            return {"fetchone": {"jobid": 555}}
        return None

    FakeDB = make_fake_db(sequence=[seq1, seq2])
    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)

    payload = {"applicantid": 1}
    # Call delete route
    resp = client.delete(
        "/api/jobroles/555", data=json.dumps(payload), content_type="application/json"
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body.get("jobid") == 555
