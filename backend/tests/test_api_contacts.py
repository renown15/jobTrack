"""Tests for Contact API endpoints."""

import json

import pytest


class TestContactsAPI:
    """Tests for /api/contacts endpoints."""

    def test_get_contacts_returns_200(self, client):
        """Test GET /api/contacts returns 200 status."""
        response = client.get("/api/contacts")
        assert response.status_code == 200

    def test_get_contacts_returns_json(self, client):
        """Test GET /api/contacts returns valid JSON."""
        response = client.get("/api/contacts")
        assert response.content_type == "application/json"
        data = response.get_json()
        assert isinstance(data, list)

    def test_get_contacts_includes_required_fields(self, client):
        """Test contacts include required fields."""
        response = client.get("/api/contacts")
        data = response.get_json()

        if len(data) > 0:
            contact = data[0]
            required_fields = ["contactid", "name", "engagement_count", "roles_count"]
            for field in required_fields:
                assert field in contact, f"Missing field: {field}"

    @pytest.mark.integration
    def test_add_contact_basic(self, client):
        """Test POST /api/contacts creates new contact."""
        import time

        timestamp = int(time.time())

        new_contact = {
            "name": f"Test Contact {timestamp}",
            "email": f"test{timestamp}@example.com",
            "phone": "123-456-7890",
            "contacttype": "Recruiter",
        }

        response = client.post(
            "/api/contacts",
            data=json.dumps(new_contact),
            content_type="application/json",
        )

        # Should return 201 Created or 409 if duplicate
        assert response.status_code in [200, 201, 409]

        if response.status_code in [200, 201]:
            data = response.get_json()
            contact_id = data.get("contactid") or data.get("id")
            assert contact_id is not None

            # Cleanup: delete the test contact
            client.delete(f"/api/contacts/{contact_id}")

    @pytest.mark.integration
    def test_add_contact_with_organization(self, client):
        """Test POST /api/contacts with organization name."""
        import time

        timestamp = int(time.time())

        new_contact = {
            "name": f"Test Contact With Org {timestamp}",
            "email": f"testorg{timestamp}@example.com",
            "org_name": "Test Organization",
            "contacttype": "Recruiter",
        }

        response = client.post(
            "/api/contacts",
            data=json.dumps(new_contact),
            content_type="application/json",
        )

        assert response.status_code in [200, 201, 409]

        if response.status_code in [200, 201]:
            data = response.get_json()
            contact_id = data.get("contactid") or data.get("id")

            # Cleanup: delete the test contact
            if contact_id:
                client.delete(f"/api/contacts/{contact_id}")

    def test_add_contact_missing_name_returns_400(self, client):
        """Test POST /api/contacts without name returns 400."""
        invalid_contact = {"email": "test@example.com"}

        response = client.post(
            "/api/contacts",
            data=json.dumps(invalid_contact),
            content_type="application/json",
        )

        assert response.status_code == 400

    @pytest.mark.integration
    def test_update_contact(self, client):
        """Test PUT /api/contacts/<id> updates contact."""
        import time

        timestamp = int(time.time())

        # First create a contact to update
        new_contact = {
            "name": f"Contact to Update {timestamp}",
            "email": f"update{timestamp}@example.com",
            "contacttype": "Recruiter",
        }

        create_response = client.post(
            "/api/contacts",
            data=json.dumps(new_contact),
            content_type="application/json",
        )

        if create_response.status_code in [200, 201]:
            created_data = create_response.get_json()
            contact_id = created_data.get("contactid") or created_data.get("id")

            # Update the contact
            update_data = {
                "name": new_contact["name"],
                "email": f"updated{timestamp}@example.com",
            }

            response = client.put(
                f"/api/contacts/{contact_id}",
                data=json.dumps(update_data),
                content_type="application/json",
            )

            assert response.status_code == 200

            # Cleanup: delete the test contact
            client.delete(f"/api/contacts/{contact_id}")

    @pytest.mark.integration
    def test_delete_contact(self, client):
        """Test DELETE /api/contacts/<id> removes contact."""
        import time

        timestamp = int(time.time())

        # First create a contact to delete
        new_contact = {
            "name": f"Contact To Delete {timestamp}",
            "email": f"delete{timestamp}@example.com",
            "contacttype": "Recruiter",
        }

        create_response = client.post(
            "/api/contacts",
            data=json.dumps(new_contact),
            content_type="application/json",
        )

        if create_response.status_code in [200, 201]:
            created_data = create_response.get_json()
            contact_id = created_data.get("contactid") or created_data.get("id")

            if contact_id:
                delete_response = client.delete(f"/api/contacts/{contact_id}")
                assert delete_response.status_code in [200, 204]


class TestContactTargetOrganisations:
    """Tests for contact target organisations endpoints."""

    def test_get_contact_targets(self, client):
        """Test GET /api/contacts/<id>/targets returns target orgs."""
        response = client.get("/api/contacts")
        contacts = response.get_json()

        if len(contacts) > 0:
            contact_id = contacts[0]["contactid"]
            response = client.get(f"/api/contacts/{contact_id}/targets")

            assert response.status_code == 200
            data = response.get_json()
            assert isinstance(data, list)

    @pytest.mark.integration
    def test_add_contact_target(self, client):
        """Test POST /api/contacts/<id>/targets adds target org."""
        import time

        timestamp = int(time.time())

        # First create a test contact
        new_contact = {
            "name": f"Test Target Contact {timestamp}",
            "email": f"target{timestamp}@example.com",
            "contacttype": "Applicant",
        }

        create_response = client.post(
            "/api/contacts",
            data=json.dumps(new_contact),
            content_type="application/json",
        )

        if create_response.status_code in [200, 201]:
            created_data = create_response.get_json()
            contact_id = created_data.get("contactid") or created_data.get("id")

            # Add target organization
            target_data = {
                "org_name": f"Target Company {timestamp}",
                "interest_level": "High",
                "notes": "Test target",
            }

            response = client.post(
                f"/api/contacts/{contact_id}/targets",
                data=json.dumps(target_data),
                content_type="application/json",
            )

            assert response.status_code in [200, 201]

            # Cleanup: delete the test contact (cascades to targets)
            client.delete(f"/api/contacts/{contact_id}")
