"""Tests for Organisation API endpoints."""

import json

import pytest


class TestOrganisationsAPI:
    """Tests for /api/organisations endpoints."""

    def test_get_organisations_returns_200(self, client):
        """Test GET /api/organisations returns 200 status."""
        response = client.get("/api/organisations")
        assert response.status_code == 200

    def test_get_organisations_returns_json(self, client):
        """Test GET /api/organisations returns valid JSON."""
        response = client.get("/api/organisations")
        assert response.content_type == "application/json"
        data = response.get_json()
        assert isinstance(data, list)

    def test_get_organisations_includes_required_fields(self, client):
        """Test organisations include required fields."""
        response = client.get("/api/organisations")
        data = response.get_json()

        if len(data) > 0:
            org = data[0]
            required_fields = ["orgid", "name"]
            for field in required_fields:
                assert field in org, f"Missing field: {field}"

    def test_get_organisation_contacts(self, client):
        """Test GET /api/organisations/<id>/contacts returns contacts for org."""
        response = client.get("/api/organisations")
        orgs = response.get_json()

        if len(orgs) > 0:
            org_id = orgs[0]["orgid"]
            response = client.get(f"/api/organisations/{org_id}/contacts")
            assert response.status_code == 200

            data = response.get_json()
            assert isinstance(data, list)

    @pytest.mark.integration
    def test_add_organisation_basic(self, client):
        """Test POST /api/organisations creates new org."""
        import time

        timestamp = int(time.time())

        new_org = {
            "name": f"Test Organisation {timestamp}",
            "website": f"https://testorg{timestamp}.com",
        }

        response = client.post(
            "/api/organisations",
            data=json.dumps(new_org),
            content_type="application/json",
        )

        assert response.status_code in [200, 201]
        data = response.get_json()
        org_id = data.get("orgid") or data.get("id")
        assert org_id is not None

        # Note: Cannot delete organizations as they may be referenced by contacts/jobroles
        # This is acceptable as it's a single test record with unique timestamp

    @pytest.mark.integration
    def test_add_organisation_with_sector(self, client):
        """Test POST /api/organisations with sector fields."""
        import time

        timestamp = int(time.time())

        new_org = {
            "name": f"Test Org with Sector {timestamp}",
            "high_level_sector": "Technology",
            "granular_sector": "Software Development",
        }

        response = client.post(
            "/api/organisations",
            data=json.dumps(new_org),
            content_type="application/json",
        )

        assert response.status_code in [200, 201]
        # Note: Cannot delete organizations as they may be referenced

    def test_add_organisation_missing_name_returns_400(self, client):
        """Test POST /api/organisations without name returns 400."""
        invalid_org = {"website": "https://example.com"}

        response = client.post(
            "/api/organisations",
            data=json.dumps(invalid_org),
            content_type="application/json",
        )

        assert response.status_code == 400

    @pytest.mark.integration
    def test_update_organisation(self, client):
        """Test PUT /api/organisations/<id> updates org."""
        import time

        timestamp = int(time.time())

        # Create a test organization first
        new_org = {
            "name": f"Test Update Org {timestamp}",
            "website": f"https://updatetest{timestamp}.com",
        }

        create_response = client.post(
            "/api/organisations",
            data=json.dumps(new_org),
            content_type="application/json",
        )

        if create_response.status_code in [200, 201]:
            created_data = create_response.get_json()
            org_id = created_data.get("orgid") or created_data.get("id")

            # Update the organization
            update_data = {
                "name": new_org["name"],
                "website": f"https://updated{timestamp}.com",
            }

            response = client.put(
                f"/api/organisations/{org_id}",
                data=json.dumps(update_data),
                content_type="application/json",
            )

            assert response.status_code == 200
            # Note: Cannot delete organizations as they may be referenced

    @pytest.mark.integration
    def test_delete_organisation(self, client):
        """Test DELETE /api/organisations/<id> deletes unreferenced org."""
        import time

        timestamp = int(time.time())
        new_org = {"name": f"Delete Test Org {timestamp}"}

        create_response = client.post(
            "/api/organisations",
            data=json.dumps(new_org),
            content_type="application/json",
        )

        assert create_response.status_code in [200, 201]
        created = create_response.get_json()
        org_id = created.get("orgid") or created.get("id")

        # Now delete
        del_resp = client.delete(f"/api/organisations/{org_id}")
        assert del_resp.status_code == 200

        # Confirm gone
        get_resp = client.get(f"/api/organisations/{org_id}")
        assert get_resp.status_code == 404
