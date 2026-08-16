"""Tests for EngagementLog API endpoints."""

import json
from datetime import date

import pytest


class TestEngagementLogsAPI:
    """Tests for /api/engagements endpoints."""

    def test_get_engagements_returns_200(self, client):
        """Test GET /api/engagements returns 200 status."""
        response = client.get("/api/engagements")
        assert response.status_code == 200

    def test_get_engagements_returns_json(self, client):
        """Test GET /api/engagements returns valid JSON."""
        response = client.get("/api/engagements")
        assert response.content_type == "application/json"
        data = response.get_json()
        assert isinstance(data, list)

    def test_get_engagements_includes_required_fields(self, client):
        """Test engagements include required fields."""
        response = client.get("/api/engagements")
        data = response.get_json()

        if len(data) > 0:
            engagement = data[0]
            # Use actual API field names: logid, logdate, logentry
            required_fields = ["logid", "logdate"]
            for field in required_fields:
                assert field in engagement, f"Missing field: {field}"

    @pytest.mark.integration
    def test_add_engagement_basic(self, client):
        """Test POST /api/engagements creates new engagement log."""
        import time

        timestamp = int(time.time())

        # Create a test contact first
        new_contact = {
            "name": f"Test Engagement Contact {timestamp}",
            "email": f"engagement{timestamp}@example.com",
            "contacttype": "Recruiter",
        }

        contact_response = client.post(
            "/api/contacts",
            data=json.dumps(new_contact),
            content_type="application/json",
        )

        if contact_response.status_code in [200, 201]:
            contact_data = contact_response.get_json()
            contact_id = contact_data.get("contactid") or contact_data.get("id")

            new_engagement = {
                "contact_id": contact_id,
                "log_date": date.today().isoformat(),
                "log_entry": "Test engagement log",
            }

            response = client.post(
                "/api/engagements",
                data=json.dumps(new_engagement),
                content_type="application/json",
            )

            assert response.status_code in [200, 201]
            data = response.get_json()
            assert (
                "logid" in data
            ), "Response should include the created engagement log ID"

            # Cleanup: delete the test contact (cascades to engagements)
            client.delete(f"/api/contacts/{contact_id}")

    @pytest.mark.integration
    def test_add_engagement_with_details(self, client):
        """Test POST /api/engagements with full details."""
        import time

        timestamp = int(time.time())

        # Create a test contact first
        new_contact = {
            "name": f"Test Detail Engagement Contact {timestamp}",
            "email": f"engdetail{timestamp}@example.com",
            "contacttype": "Recruiter",
        }

        contact_response = client.post(
            "/api/contacts",
            data=json.dumps(new_contact),
            content_type="application/json",
        )

        if contact_response.status_code in [200, 201]:
            contact_data = contact_response.get_json()
            contact_id = contact_data.get("contactid") or contact_data.get("id")

            new_engagement = {
                "contact_id": contact_id,
                "log_date": date.today().isoformat(),
                "log_entry": "Detailed engagement log with positive outcome",
            }

            response = client.post(
                "/api/engagements",
                data=json.dumps(new_engagement),
                content_type="application/json",
            )

            assert response.status_code in [200, 201]

            # Cleanup: delete the test contact (cascades to engagements)
            client.delete(f"/api/contacts/{contact_id}")

    def test_add_engagement_missing_contact_returns_400(self, client):
        """Test POST /api/engagements without contactid returns 400."""
        invalid_engagement = {
            "engagement_date": date.today().isoformat(),
            "engagement_type": "Email",
        }

        response = client.post(
            "/api/engagements",
            data=json.dumps(invalid_engagement),
            content_type="application/json",
        )

        assert response.status_code == 400
