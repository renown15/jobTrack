import json

import app as app_module

_ = app_module


def test_create_task_creates_and_returns_task(client, make_fake_db, monkeypatch):
    """POST /api/tasks should insert a task and return the created record."""

    def seq_entry(query):
        q = (query or "").lower()
        if q.strip().startswith("insert into public.task"):
            return {"fetchone": {"taskid": 77, "applicantid": 1, "name": "Do thing"}}
        return {}

    FakeDB = make_fake_db(sequence=[seq_entry])
    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)

    payload = {"applicantid": 1, "name": "Do thing"}
    resp = client.post(
        "/api/tasks", data=json.dumps(payload), content_type="application/json"
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body.get("taskid") == 77
