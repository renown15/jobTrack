"""
Integration tests for applicant export/import functionality with reference data
and sector ID mapping.
"""

import json
import os
import uuid

import psycopg2
from conftest import fetchone_not_none
import pytest
from werkzeug.security import generate_password_hash


@pytest.mark.integration
def test_export_applicant_includes_reference_values(client):
    """GET /api/admin/applicants/<id>/export includes reference data values."""
    test_db = os.environ.get("TEST_DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set"

    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            # Create superuser
            super_email = f"test.super+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                (
                    "Super",
                    "User",
                    super_email,
                    True,
                    True,
                    generate_password_hash("password123"),
                ),
            )
            super_id = fetchone_not_none(cur)[0]

            # Create target applicant
            target_email = f"test.export+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser)
                   VALUES (%s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                ("Export", "Target", target_email, True, False),
            )
            target_id = fetchone_not_none(cur)[0]

            # Get a reference data ID (assume 'Recruiter' role type exists)
            cur.execute(
                "SELECT refid FROM referencedata WHERE refdataclass = 'RoleType' LIMIT 1;"
            )
            row = fetchone_not_none(cur)
            if row:
                role_type_id = row[0]

                # Create contact with role type
                cur.execute(
                    """INSERT INTO contact (applicantid, firstname, lastname, email, roletypeid)
                       VALUES (%s, %s, %s, %s, %s)
                       RETURNING contactid;""",
                    (target_id, "Test", "Contact", "contact@example.com", role_type_id),
                )
                _contact_id = fetchone_not_none(cur)[0]
                assert _contact_id is not None

            # Get a sector ID (assume at least one sector exists)
            cur.execute("SELECT sectorid, summary FROM sector LIMIT 1;")
            sector_row = fetchone_not_none(cur)
            if sector_row:
                sector_id, sector_name = sector_row

                # Create organisation with sector
                cur.execute(
                    """INSERT INTO organisation (applicantid, name, sectorid)
                       VALUES (%s, %s, %s)
                       RETURNING orgid;""",
                    (target_id, "Test Company", sector_id),
                )
                _org_id = fetchone_not_none(cur)[0]
                assert _org_id is not None

            conn.commit()

            # Login as superuser
            with client.session_transaction() as sess:
                sess["applicantid"] = super_id

            # Export applicant
            resp = client.get(f"/api/admin/applicants/{target_id}/export")
            assert resp.status_code == 200

            data = resp.get_json()
            assert data["export_version"] == "1.0"
            assert "export_date" in data
            assert data["applicant_profile"]["applicantid"] == target_id

            # Verify contacts include reference data values
            if row:
                contacts = data.get("contacts", [])
                assert len(contacts) > 0
                contact = contacts[0]
                assert "roletypevalue" in contact
                assert "refdataclass" in contact

            # Verify organisations include sector names
            if sector_row:
                orgs = data.get("organisations", [])
                assert len(orgs) > 0
                org = orgs[0]
                assert "sectorname" in org
                assert org["sectorname"] == sector_name

            # Cleanup
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid IN (%s, %s)",
                (super_id, target_id),
            )
            conn.commit()
    finally:
        conn.close()


@pytest.mark.integration
def test_import_applicant_maps_reference_data(client):
    """POST /api/admin/applicants/import maps reference data by value."""
    test_db = os.environ.get("TEST_DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set"

    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            # Create superuser
            super_email = f"test.super+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                (
                    "Super",
                    "User",
                    super_email,
                    True,
                    True,
                    generate_password_hash("password123"),
                ),
            )
            super_id = fetchone_not_none(cur)[0]
            conn.commit()

            # Get reference data for creating import data
            cur.execute(
                "SELECT refid, refdataclass, refvalue FROM referencedata WHERE refdataclass = 'JobStatus' LIMIT 1;"
            )
            ref_row = fetchone_not_none(cur)
            assert ref_row, "Need at least one JobStatus reference data"
            _, status_class, status_value = ref_row

            cur.execute("SELECT sectorid, summary FROM sector LIMIT 1;")
            sector_row = fetchone_not_none(cur)
            assert sector_row, "Need at least one sector"
            _, sector_name = sector_row

            # Create import data with reference values (not IDs)
            import_email = f"test.import+{uuid.uuid4().hex}@example.com"
            import_data = {
                "export_version": "1.0",
                "applicant_profile": {
                    "applicantid": 99999,  # Will be ignored, new ID generated
                    "firstname": "Import",
                    "lastname": "Test",
                    "email": import_email,
                    "isactive": True,
                },
                "organisations": [
                    {
                        "orgid": 99999,
                        "name": "Import Test Org",
                        "sector": 99999,  # Old ID - will be remapped
                        "sectorname": sector_name,  # Value to lookup
                    }
                ],
                "contacts": [],
                "job_roles": [
                    {
                        "jobid": 99999,
                        "rolename": "Test Role",
                        "statusid": 99999,  # Old ID
                        "statusclass": status_class,
                        "statusvalue": status_value,
                        "companyorgid": 99999,  # Will be remapped
                    }
                ],
                "engagements": [],
                "documents": [],
                "networking_events": [],
                "tasks": [],
                "leads": [],
                "contact_target_organisations": [],
                "engagement_documents": [],
            }

            # Create target applicant
            target_email = f"test.target+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile
                   (firstname, lastname, email, isactive, issuperuser)
                   VALUES (%s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                ("Target", "Applicant", target_email, True, False),
            )
            target_id = fetchone_not_none(cur)[0]
            conn.commit()

            # Login as superuser
            with client.session_transaction() as sess:
                sess["applicantid"] = super_id

            # Import to target applicant
            resp = client.post(
                "/api/admin/applicants/import",
                data=json.dumps({"target_applicantid": target_id, **import_data}),
                content_type="application/json",
            )
            assert resp.status_code == 200

            result = resp.get_json()
            assert result["ok"] is True

            # Verify target applicant profile unchanged
            cur.execute(
                "SELECT email FROM applicantprofile WHERE applicantid = %s",
                (target_id,),
            )
            row = fetchone_not_none(cur)
            assert row[0] == target_email

            # Verify organisation created with correct sector
            cur.execute(
                """SELECT o.name, s.summary 
                   FROM organisation o 
                   LEFT JOIN sector s ON o.sectorid = s.sectorid 
                   WHERE o.applicantid = %s""",
                (target_id,),
            )
            org_row = fetchone_not_none(cur)
            assert org_row is not None
            assert org_row[0] == "Import Test Org"
            assert org_row[1] == sector_name

            # Verify job role created with correct status
            cur.execute(
                """SELECT jr.rolename, rd.refvalue 
                   FROM jobrole jr 
                   LEFT JOIN referencedata rd ON jr.statusid = rd.refid 
                   WHERE jr.applicantid = %s""",
                (target_id,),
            )
            role_row = fetchone_not_none(cur)
            assert role_row is not None
            assert role_row[0] == "Test Role"
            assert role_row[1] == status_value

            # Cleanup
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid IN (%s, %s)",
                (super_id, target_id),
            )
            conn.commit()
    finally:
        conn.close()


@pytest.mark.integration
def test_export_import_round_trip(client):
    """Export and then import an applicant preserves all data with ID remapping."""
    test_db = os.environ.get("TEST_DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set"

    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            # Create superuser
            super_email = f"test.super+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                (
                    "Super",
                    "User",
                    super_email,
                    True,
                    True,
                    generate_password_hash("password123"),
                ),
            )
            super_id = fetchone_not_none(cur)[0]

            # Create source applicant with various data
            source_email = f"test.source+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, phone, city, isactive, issuperuser)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                ("Source", "Person", source_email, "555-1234", "London", True, False),
            )
            source_id = fetchone_not_none(cur)[0]

            # Create organisation with unique name
            unique_org_name = f"Source Company {uuid.uuid4().hex[:8]}"
            cur.execute(
                """INSERT INTO organisation (applicantid, name)
                   VALUES (%s, %s)
                   RETURNING orgid;""",
                (source_id, unique_org_name),
            )
            org_id = fetchone_not_none(cur)[0]

            # Create contact
            cur.execute(
                """INSERT INTO contact (applicantid, name, currentorgid)
                   VALUES (%s, %s, %s)
                   RETURNING contactid;""",
                (source_id, "Contact Person", org_id),
            )
            _contact_id = fetchone_not_none(cur)[0]

            # Create job role
            cur.execute(
                """INSERT INTO jobrole (applicantid, contactid, companyorgid, rolename, statusid)
                   VALUES (%s, %s, %s, %s, %s)
                   RETURNING jobid;""",
                (source_id, _contact_id, org_id, "Software Engineer", 7),
            )
            _job_id = fetchone_not_none(cur)[0]
            assert _job_id is not None

            # Create engagement
            cur.execute(
                """INSERT INTO engagementlog (applicantid, contactid, logdate, logentry)
                   VALUES (%s, %s, %s, %s)
                   RETURNING engagementlogid;""",
                (source_id, _contact_id, "2025-01-15", "Initial call"),
            )
            _engagement_id = fetchone_not_none(cur)[0]
            assert _engagement_id is not None

            conn.commit()

            # Login as superuser
            with client.session_transaction() as sess:
                sess["applicantid"] = super_id

            # Export source applicant
            resp = client.get(f"/api/admin/applicants/{source_id}/export")
            assert resp.status_code == 200
            export_data = resp.get_json()

            # Verify export structure
            assert export_data["applicant_profile"]["email"] == source_email
            assert len(export_data["organisations"]) == 1
            assert len(export_data["contacts"]) == 1
            assert len(export_data["job_roles"]) == 1
            assert len(export_data["engagements"]) == 1

            # Create target applicant (stub profile to import into)
            target_email = f"test.target+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile
                   (firstname, lastname, email, isactive, issuperuser)
                   VALUES (%s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                ("Target", "Applicant", target_email, True, False),
            )
            target_id = fetchone_not_none(cur)[0]
            conn.commit()

            # Import to target applicant
            resp = client.post(
                "/api/admin/applicants/import",
                data=json.dumps({"target_applicantid": target_id, **export_data}),
                content_type="application/json",
            )
            assert resp.status_code == 200

            # Verify imported data is in target applicant
            cur.execute(
                "SELECT firstname, lastname, email FROM applicantprofile WHERE applicantid = %s",
                (target_id,),
            )
            profile_row = fetchone_not_none(cur)
            # Profile data should remain unchanged (we import entities, not profile)
            assert profile_row == ("Target", "Applicant", target_email)

            # Verify organisation imported
            cur.execute(
                "SELECT COUNT(*) FROM organisation WHERE applicantid = %s", (target_id,)
            )
            assert fetchone_not_none(cur)[0] == 1

            # Verify contact imported and linked to new org
            cur.execute(
                """SELECT c.name, o.name 
                   FROM contact c 
                   LEFT JOIN organisation o ON c.currentorgid = o.orgid 
                   WHERE c.applicantid = %s""",
                (target_id,),
            )
            contact_row = fetchone_not_none(cur)
            assert contact_row[0] == "Contact Person"
            assert contact_row[1] == unique_org_name

            # Verify job role imported with correct relationships
            cur.execute(
                """SELECT jr.rolename, c.name, o.name 
                   FROM jobrole jr 
                   LEFT JOIN contact c ON jr.contactid = c.contactid 
                   LEFT JOIN organisation o ON jr.companyorgid = o.orgid 
                   WHERE jr.applicantid = %s""",
                (target_id,),
            )
            role_row = fetchone_not_none(cur)
            assert role_row[0] == "Software Engineer"
            assert role_row[1] == "Contact Person"
            assert role_row[2] == unique_org_name

            # Verify engagement imported with correct contact link
            cur.execute(
                """SELECT el.logentry, c.name 
                   FROM engagementlog el 
                   LEFT JOIN contact c ON el.contactid = c.contactid 
                   WHERE el.applicantid = %s""",
                (target_id,),
            )
            eng_row = fetchone_not_none(cur)
            assert eng_row == ("Initial call", "Contact Person")

            # Cleanup
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid IN (%s, %s, %s)",
                (super_id, source_id, target_id),
            )
            conn.commit()
    finally:
        conn.close()


@pytest.mark.integration
def test_import_clears_password_and_never_imports_superuser(client):
    """Import always clears password and sets issuperuser=false for security."""
    test_db = os.environ.get("TEST_DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set"

    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            # Create superuser
            super_email = f"test.super+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                (
                    "Super",
                    "User",
                    super_email,
                    True,
                    True,
                    generate_password_hash("password123"),
                ),
            )
            super_id = fetchone_not_none(cur)[0]
            conn.commit()

            # Create import data with password and superuser flag
            import_email = f"test.import+{uuid.uuid4().hex}@example.com"
            import_data = {
                "export_version": "1.0",
                "applicant_profile": {
                    "applicantid": 88888,
                    "firstname": "Import",
                    "lastname": "Test",
                    "email": import_email,
                    "isactive": True,
                    "issuperuser": True,  # Should be ignored
                    "passwordhash": "pbkdf2:sha256:some-hash",  # Should be cleared
                },
                "organisations": [],
                "contacts": [],
                "job_roles": [],
                "engagements": [],
                "documents": [],
                "networking_events": [],
                "tasks": [],
                "leads": [],
                "contact_target_organisations": [],
                "engagement_documents": [],
            }

            # Create target applicant
            target_email = f"test.target+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile
                   (firstname, lastname, email, isactive, issuperuser)
                   VALUES (%s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                ("Target", "Applicant", target_email, True, False),
            )
            target_id = fetchone_not_none(cur)[0]
            conn.commit()

            # Login as superuser
            with client.session_transaction() as sess:
                sess["applicantid"] = super_id

            # Import (note: profile data from import_data will be ignored)
            resp = client.post(
                "/api/admin/applicants/import",
                data=json.dumps({"target_applicantid": target_id, **import_data}),
                content_type="application/json",
            )
            assert resp.status_code == 200

            # Verify target profile unchanged (import doesn't modify profile)
            cur.execute(
                "SELECT passwordhash, issuperuser, email FROM applicantprofile WHERE applicantid = %s",
                (target_id,),
            )
            row = fetchone_not_none(cur)
            assert row[0] is None  # Password still null
            assert row[1] is False  # Still not superuser
            assert row[2] == target_email  # Email unchanged

            # Cleanup
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid IN (%s, %s)",
                (super_id, target_id),
            )
            conn.commit()
    finally:
        conn.close()


@pytest.mark.integration
def test_import_handles_missing_reference_data_gracefully(client):
    """Import sets NULL for reference data that doesn't exist in target DB."""
    test_db = os.environ.get("TEST_DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set"

    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            # Create superuser
            super_email = f"test.super+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                (
                    "Super",
                    "User",
                    super_email,
                    True,
                    True,
                    generate_password_hash("password123"),
                ),
            )
            super_id = fetchone_not_none(cur)[0]
            conn.commit()

            # Create import data with non-existent reference values
            import_email = f"test.import+{uuid.uuid4().hex}@example.com"
            import_data = {
                "export_version": "1.0",
                "applicant_profile": {
                    "firstname": "Import",
                    "lastname": "Test",
                    "email": import_email,
                    "isactive": True,
                },
                "organisations": [
                    {
                        "orgid": 77777,
                        "name": "Test Org",
                        "sectorname": "NonExistentSector123456",  # Doesn't exist
                    }
                ],
                "contacts": [
                    {
                        "contactid": 77777,
                        "name": "Test Contact",
                        "refdataclass": "RoleType",
                        "roletypevalue": "NonExistentRoleType123456",  # Doesn't exist
                    }
                ],
                "job_roles": [],
                "engagements": [],
                "documents": [],
                "networking_events": [],
                "tasks": [],
                "leads": [],
                "contact_target_organisations": [],
                "engagement_documents": [],
            }

            # Create target applicant
            target_email = f"test.target+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile
                   (firstname, lastname, email, isactive, issuperuser)
                   VALUES (%s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                ("Target", "Applicant", target_email, True, False),
            )
            target_id = fetchone_not_none(cur)[0]
            conn.commit()

            # Login as superuser
            with client.session_transaction() as sess:
                sess["applicantid"] = super_id

            # Import should succeed even with missing reference data
            resp = client.post(
                "/api/admin/applicants/import",
                data=json.dumps({"target_applicantid": target_id, **import_data}),
                content_type="application/json",
            )
            assert resp.status_code == 200

            # Verify organisation created with NULL sector
            cur.execute(
                "SELECT sectorid FROM organisation WHERE applicantid = %s", (target_id,)
            )
            row = fetchone_not_none(cur)
            assert row[0] is None  # Sector not found, set to NULL

            # Verify contact created with NULL roletypeid
            cur.execute(
                "SELECT roletypeid FROM contact WHERE applicantid = %s", (target_id,)
            )
            row = fetchone_not_none(cur)
            assert row[0] is None  # Role type not found, set to NULL

            # Cleanup
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid IN (%s, %s)",
                (super_id, target_id),
            )
            conn.commit()
    finally:
        conn.close()
