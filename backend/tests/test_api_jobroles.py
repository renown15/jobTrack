"""Tests for JobRole API endpoints."""

import json
import os
from datetime import date

import psycopg2
import pytest


def _refid_for(refdataclass: str, refvalue: str):
    """Return the numeric refid for a referencedata row from the test DB.

    Uses the `TEST_DATABASE_URL` environment variable to connect to the test
    database. Returns `None` if the value isn't found or `TEST_DATABASE_URL`
    is not set.
    """
    db_url = os.environ.get("TEST_DATABASE_URL")
    if not db_url:
        return None
    try:
        conn = psycopg2.connect(db_url)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT refid FROM public.referencedata WHERE refdataclass = %s AND lower(refvalue) = lower(%s) LIMIT 1;",
                    (refdataclass, refvalue),
                )
                row = cur.fetchone()
                return int(row[0]) if row else None
        finally:
            conn.close()
    except Exception:
        return None


class TestJobRolesAPI:
    """Tests for /api/jobroles endpoints."""

    def test_get_jobroles_returns_200(self, client):
        """Test GET /api/jobroles returns 200 status."""
        response = client.get("/api/jobroles")
        assert response.status_code == 200

    def test_get_jobroles_returns_json(self, client):
        """Test GET /api/jobroles returns valid JSON."""
        response = client.get("/api/jobroles")
        assert response.content_type == "application/json"
        data = response.get_json()
        assert isinstance(data, list)

    def test_get_jobroles_includes_required_fields(self, client):
        """Test jobroles include required fields."""
        response = client.get("/api/jobroles")
        data = response.get_json()

        if len(data) > 0:
            role = data[0]
            required_fields = ["jobid", "contactid", "companyorgid", "rolename"]
            for field in required_fields:
                assert field in role, f"Missing field: {field}"

    @pytest.mark.integration
    def test_add_jobrole_basic(self, client):
        """Test POST /api/jobroles creates new role."""
        import time

        timestamp = int(time.time())

        # Create a test contact first
        new_contact = {
            "name": f"Test Jobrole Contact {timestamp}",
            "email": f"jobrole{timestamp}@example.com",
            "contacttype": "Applicant",
        }

        contact_response = client.post(
            "/api/contacts",
            data=json.dumps(new_contact),
            content_type="application/json",
        )

        if contact_response.status_code in [200, 201]:
            contact_data = contact_response.get_json()
            contact_id = contact_data.get("contactid") or contact_data.get("id")

            statusid = _refid_for("application_status", "Applied")
            new_role = {
                "contactid": contact_id,
                "company_name": f"Test Company {timestamp}",
                "rolename": "Software Engineer",
                "applicationdate": date.today().isoformat(),
                "statusid": statusid,
            }

            response = client.post(
                "/api/jobroles",
                data=json.dumps(new_role),
                content_type="application/json",
            )

            assert response.status_code in [200, 201]
            data = response.get_json()
            assert "roleid" in data or "jobid" in data or "id" in data

            # Cleanup: delete the test contact (cascades to jobroles)
            client.delete(f"/api/contacts/{contact_id}")

    @pytest.mark.integration
    def test_add_jobrole_with_details(self, client):
        """Test POST /api/jobroles with full details."""
        import time

        timestamp = int(time.time())

        # Create a test contact first
        new_contact = {
            "name": f"Test Detailed Jobrole Contact {timestamp}",
            "email": f"jobdetail{timestamp}@example.com",
            "contacttype": "Applicant",
        }

        contact_response = client.post(
            "/api/contacts",
            data=json.dumps(new_contact),
            content_type="application/json",
        )

        if contact_response.status_code in [200, 201]:
            contact_data = contact_response.get_json()
            contact_id = contact_data.get("contactid") or contact_data.get("id")

            statusid = _refid_for("application_status", "Interview")
            new_role = {
                "contactid": contact_id,
                "company_name": f"Detailed Test Company {timestamp}",
                "rolename": "Senior Developer",
                "applicationdate": date.today().isoformat(),
                "statusid": statusid,
                "notes": "Test role with details",
            }

            response = client.post(
                "/api/jobroles",
                data=json.dumps(new_role),
                content_type="application/json",
            )

            assert response.status_code in [200, 201]

            # Cleanup: delete the test contact (cascades to jobroles)
            client.delete(f"/api/contacts/{contact_id}")

    def test_add_jobrole_missing_contact_returns_400(self, client):
        """Test POST /api/jobroles without contactid returns 400."""
        invalid_role = {"company_name": "Test Company", "jobtitle": "Developer"}

        response = client.post(
            "/api/jobroles",
            data=json.dumps(invalid_role),
            content_type="application/json",
        )

        assert response.status_code == 400

    @pytest.mark.integration
    def test_update_jobrole_status(self, client):
        """Test PUT /api/jobroles/<id> updates role status."""
        import time

        timestamp = int(time.time())

        # Create a test contact first
        new_contact = {
            "name": f"Test Update Jobrole Contact {timestamp}",
            "email": f"jobupdate{timestamp}@example.com",
            "contacttype": "Applicant",
        }

        contact_response = client.post(
            "/api/contacts",
            data=json.dumps(new_contact),
            content_type="application/json",
        )

        if contact_response.status_code in [200, 201]:
            contact_data = contact_response.get_json()
            contact_id = contact_data.get("contactid") or contact_data.get("id")

            # Create a jobrole
            statusid = _refid_for("application_status", "Applied")
            new_role = {
                "contactid": contact_id,
                "company_name": f"Update Test Company {timestamp}",
                "rolename": "Developer",
                "applicationdate": date.today().isoformat(),
                "statusid": statusid,
            }

            role_response = client.post(
                "/api/jobroles",
                data=json.dumps(new_role),
                content_type="application/json",
            )

            if role_response.status_code in [200, 201]:
                role_data = role_response.get_json()
                role_id = (
                    role_data.get("roleid")
                    or role_data.get("jobid")
                    or role_data.get("id")
                )

                # Update the role status
                update_data = {
                    "statusid": _refid_for("application_status", "Interview")
                }

                response = client.put(
                    f"/api/jobroles/{role_id}",
                    data=json.dumps(update_data),
                    content_type="application/json",
                )

                assert response.status_code == 200

                # Cleanup: delete the test contact (cascades to jobroles)
                client.delete(f"/api/contacts/{contact_id}")

    @pytest.mark.integration
    def test_delete_jobrole(self, client):
        """Test DELETE /api/jobroles/<id> deletes a created jobrole."""
        import time

        timestamp = int(time.time())

        # Create a test contact first
        new_contact = {
            "name": f"Test Delete Jobrole Contact {timestamp}",
            "email": f"jobdeleted{timestamp}@example.com",
            "contacttype": "Applicant",
        }

        contact_response = client.post(
            "/api/contacts",
            data=json.dumps(new_contact),
            content_type="application/json",
        )

        if contact_response.status_code in [200, 201]:
            contact_data = contact_response.get_json()
            contact_id = contact_data.get("contactid") or contact_data.get("id")

            statusid = _refid_for("application_status", "Applied")
            new_role = {
                "contactid": contact_id,
                "company_name": f"Delete Test Company {timestamp}",
                "rolename": "Temp Role",
                "applicationdate": date.today().isoformat(),
                "statusid": statusid,
            }

            role_response = client.post(
                "/api/jobroles",
                data=json.dumps(new_role),
                content_type="application/json",
            )

            assert role_response.status_code in [200, 201]
            role_data = role_response.get_json()
            role_id = (
                role_data.get("jobid") or role_data.get("roleid") or role_data.get("id")
            )

            # Now delete the jobrole
            del_resp = client.delete(f"/api/jobroles/{role_id}")
            assert del_resp.status_code == 200

            # Cleanup contact
            client.delete(f"/api/contacts/{contact_id}")
