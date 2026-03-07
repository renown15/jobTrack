import io
import zipfile


def test_import_leads_missing_file(client):
    resp = client.post("/api/1/leads/import")
    assert resp.status_code == 400
    body = resp.get_json()
    assert body.get("error") == "Missing file"


def test_import_leads_not_zip_returns_400(client):
    # create a non-zip file upload, include applicantid in form so endpoint proceeds
    data = {"applicantid": "1", "file": (io.BytesIO(b"not-a-zip"), "test.bin")}
    resp = client.post(
        "/api/1/leads/import", data=data, content_type="multipart/form-data"
    )
    assert resp.status_code == 400
    assert resp.get_json().get("error") == "Not a zip file"


def test_import_leads_zip_without_csv_returns_400(client):
    # build an in-memory zip with no CSV files
    mem = io.BytesIO()
    with zipfile.ZipFile(mem, mode="w") as z:
        z.writestr("readme.txt", "no csv here")
    mem.seek(0)

    data = {"applicantid": "1", "file": (mem, "archive.zip")}
    resp = client.post(
        "/api/1/leads/import", data=data, content_type="multipart/form-data"
    )
    assert resp.status_code == 400
    assert resp.get_json().get("error") == "No CSV found in archive"
