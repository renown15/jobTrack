from datetime import date

import app as app_module

_ = app_module


def test_get_jobroles_formats_dates(monkeypatch, client, make_fake_db):
    # Return one jobrole with a date object
    def _fetchall(q):
        return [
            {
                "jobid": 1,
                "rolename": "Engineer",
                "applicationdate": date(2020, 1, 2),
            }
        ]

    FakeDB = make_fake_db(fetchall=_fetchall)
    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)
    monkeypatch.setattr(app_module, "require_applicant_allowed", lambda aid: None)

    resp = client.get("/api/1/jobroles")
    assert resp.status_code == 200
    rows = resp.get_json()
    assert isinstance(rows, list)
    assert rows[0]["applicationdate"] == "2020-01-02"


def test_get_engagements_count_returns_number(monkeypatch, client, make_fake_db):
    # Simulate a COUNT result
    def _fetchone(q):
        return (7,)

    FakeDB = make_fake_db(fetchone=_fetchone)
    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)
    monkeypatch.setattr(app_module, "require_applicant_allowed", lambda aid: None)

    resp = client.get("/api/1/engagements/count")
    assert resp.status_code == 200
    assert resp.get_json() == 7


def test_get_organisations_returns_list(monkeypatch, client, make_fake_db):
    # Return two organisations with date objects
    def _fetchall(q):
        return [
            {
                "orgid": 1,
                "name": "A Co",
                "talentcommunitydateadded": None,
                "created_at": None,
            },
            {
                "orgid": 2,
                "name": "B Co",
                "talentcommunitydateadded": date(2021, 5, 6),
                "created_at": date(2021, 5, 1),
            },
        ]

    FakeDB = make_fake_db(fetchall=_fetchall)
    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)

    resp = client.get("/api/1/organisations")
    assert resp.status_code == 200
    rows = resp.get_json()
    assert any(r["name"] == "A Co" for r in rows)
    assert any(
        r["talentcommunitydateadded"] == "2021-05-06"
        for r in rows
        if r.get("talentcommunitydateadded")
    )
