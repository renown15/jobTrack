import json

import app as app_module

_ = app_module


def test_settings_run_sql_allows_db_query(monkeypatch, client):
    """settings_run_sql should execute stored DB_QUERY rows only."""

    # Prepare a fake stored row
    fake_row = {
        "inputid": 999999,
        "inputtypeid": "DB_QUERY",
        "inputvalue": "SELECT 1 AS one",
    }

    class FakeCursor:
        def __init__(self):
            self._rows = []
            self._row = None

        def execute(self, query, params=None):
            q = (query or "").lower()
            if "from navigatorinput" in q:
                # return the stored navigatorinput row
                self._row = fake_row
            elif "select 1 as one" in q:
                self._rows = [{"one": 1}]
            else:
                self._rows = []

        def fetchone(self):
            return self._row

        def fetchall(self):
            return self._rows

        # context manager support
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeConn:
        def cursor(self, cursor_factory=None):
            return FakeCursor()

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeDB:
        def __enter__(self):
            return FakeConn()

        def __exit__(self, exc_type, exc, tb):
            return False

    # monkeypatch the Database context manager used in app
    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)
    # bypass authentication guard in tests
    monkeypatch.setattr(app_module, "require_applicant_allowed", lambda aid: None)

    # call endpoint
    resp = client.post(
        "/api/1/settings/run_sql",
        data=json.dumps({"query_id": fake_row["inputid"]}),
        content_type="application/json",
    )

    assert resp.status_code == 200
    body = resp.get_json()
    assert body.get("ok") is True
    assert isinstance(body.get("rows"), list)
    assert body["rows"][0].get("one") == 1
