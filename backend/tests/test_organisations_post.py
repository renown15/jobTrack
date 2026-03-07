import json

import app as app_module

_ = app_module


def test_create_sector_returns_201(client, make_fake_db, monkeypatch):
    """POST /api/sectors should create a sector and return 201 with the created object."""

    def seq_entry_1(query):
        q = (query or "").lower()
        # INSERT INTO sector ... RETURNING sectorid, summary, description
        if q.strip().startswith("insert into sector"):
            return {
                "fetchone": {
                    "sectorid": 42,
                    "summary": "New Sector",
                    "description": "desc",
                }
            }
        return {}

    FakeDB = make_fake_db(sequence=[seq_entry_1])
    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)

    payload = {"summary": "New Sector", "description": "desc"}
    resp = client.post(
        "/api/sectors", data=json.dumps(payload), content_type="application/json"
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body.get("sectorid") == 42
    assert body.get("summary") == "New Sector"
