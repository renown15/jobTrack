import io
import zipfile

import app as app_module

_ = app_module


def test_import_leads_deduplicates_rows(monkeypatch, client):
    # Build a CSV with duplicate rows (same name + same date)
    csv_text = "Name,Connected On,Email\nAlice,01 Jan 2020,alice@example.com\nAlice,01 Jan 2020,alice2@example.com\n"
    mem = io.BytesIO()
    with zipfile.ZipFile(mem, mode="w") as z:
        z.writestr("Connections.csv", csv_text)
    mem.seek(0)

    # State for fake cursor
    state = {"inserted": 0}

    def fake_execute(q, params=None):
        ql = (q or "").lower()
        # If it's the INSERT into lead, simulate returning a leadid
        if ql.strip().startswith("insert into public.lead"):
            state["last_inserted"] = 123 + state["inserted"]
            state["inserted"] += 1

    def fake_fetchone(q=None):
        # When asked for existing leads (SELECT ... FROM public.lead) return nothing initially
        return None

    class FakeCursor:
        def __init__(self):
            self.last_query = None

        def execute(self, query, params=None):
            self.last_query = query
            fake_execute(query, params)

        def fetchone(self):
            # If last execute was an insert, return a mapping-like object
            if (
                self.last_query
                and "insert into public.lead" in (self.last_query or "").lower()
            ):
                return {"leadid": state.get("last_inserted")}
            return None

        def fetchall(self):
            return []

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

    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)

    data = {"applicantid": "1", "file": (mem, "connections.zip")}
    resp = client.post(
        "/api/1/leads/import", data=data, content_type="multipart/form-data"
    )
    assert resp.status_code == 200
    body = resp.get_json()
    # Should have inserted only one (the duplicate second row deduped)
    assert body.get("imported") == 1
