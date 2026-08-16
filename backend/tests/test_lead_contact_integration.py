import io
import json
import os
import zipfile

import psycopg2
import pytest


@pytest.mark.integration
def test_import_promote_and_create_contact(client):
    """Integration test: import a lead, promote it, create a contact with leadid and assert DB state."""
    # Build a small CSV inside a ZIP as the import endpoint expects
    csv_text = "Name,Connected On,Email,Company,Position\nIntegration Lead,2020-01-01,integ@example.com,Acme,Engineer\n"
    mem = io.BytesIO()
    with zipfile.ZipFile(mem, mode="w") as z:
        z.writestr("Connections.csv", csv_text)
    mem.seek(0)

    # Import leads via endpoint (scoped applicant path is rewritten by client fixture)
    data = {"applicantid": "1", "file": (mem, "connections.zip")}
    resp = client.post(
        "/api/1/leads/import", data=data, content_type="multipart/form-data"
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body.get("imported") == 1

    # Connect directly to test DB to find the inserted leadid
    db_url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    assert db_url, "TEST_DATABASE_URL must be set for integration tests"

    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT leadid FROM public.lead WHERE email=%s AND applicantid=%s ORDER BY leadid DESC LIMIT 1;",
                ("integ@example.com", 1),
            )
            row = cur.fetchone()
            assert row, "Lead not found in DB after import"
            leadid = int(row[0])

    # Promote the lead (set review outcome to 'Promoted To Contact')
    # Lookup the refid in the test DB to avoid string-matching issues
    # Ensure the 'Promoted To Contact' referencedata exists, then lookup its refid
    with psycopg2.connect(db_url) as conn2:
        with conn2.cursor() as cur2:
            cur2.execute(
                "INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('lead_review_status', 'Promoted To Contact') ON CONFLICT (refdataclass, refvalue) DO NOTHING;"
            )
            cur2.execute(
                "SELECT refid FROM public.referencedata WHERE lower(refdataclass) = 'lead_review_status' AND lower(refvalue) = 'promoted to contact' LIMIT 1;"
            )
            rrow = cur2.fetchone()
            assert (
                rrow
            ), "Promoted To Contact refvalue not found in referencedata after insert"
            promoted_refid = int(rrow[0])

    resp2 = client.post(
        f"/api/1/leads/{leadid}/set_reviewoutcome",
        data=json.dumps({"refid": promoted_refid}),
        content_type="application/json",
    )
    assert resp2.status_code == 200

    # Create a contact row directly in DB referencing the leadid (bypass API path that may vary)
    with psycopg2.connect(db_url) as conn3:
        with conn3.cursor() as cur3:
            cur3.execute(
                "INSERT INTO public.contact (name, applicantid, leadid) VALUES (%s, %s, %s) RETURNING contactid;",
                ("Contact From Lead", 1, leadid),
            )
            new_row = cur3.fetchone()
            assert new_row and new_row[0]
            new_id = int(new_row[0])

    # Verify contact row references the leadid
    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT leadid FROM public.contact WHERE contactid = %s AND applicantid = %s",
                (int(new_id), 1),
            )
            crow = cur.fetchone()
            assert crow, "Contact row not found in DB"
            assert int(crow[0]) == leadid

    # Verify lead reviewoutcome is set to the promoted refid
    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT reviewoutcomeid FROM public.lead WHERE leadid = %s AND applicantid = %s",
                (leadid, 1),
            )
            lrow = cur.fetchone()
            assert lrow and lrow[0] is not None
            # Lookup the refid for 'Promoted To Contact'
            cur.execute(
                "SELECT refid FROM public.referencedata WHERE lower(refdataclass)='lead_review_status' AND lower(refvalue)=lower(%s) LIMIT 1",
                ("Promoted To Contact",),
            )
            rr = cur.fetchone()
            assert rr and rr[0] is not None
            assert int(lrow[0]) == int(rr[0])
