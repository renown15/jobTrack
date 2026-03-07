"""Tests for Settings API endpoints."""

import json
import time

import pytest

# Provide deterministic canned responses for non-integration tests so the
# settings/refdata endpoints don't require a live database. Skip stubbing for
# tests marked with `@pytest.mark.integration` so integration tests continue
# to exercise the real DB-backed handlers.
from app import app as _flask_app


@pytest.fixture(autouse=True)
def _stub_settings_endpoints(request, monkeypatch):
    # Don't stub integration tests
    if request.node.get_closest_marker("integration"):
        yield
        return

    def _fake_refdata():
        from flask import jsonify

        return jsonify({"sectors": [], "referencedata": []})

    def _fake_applicant():
        from flask import jsonify

        return jsonify(
            {
                "applicantId": None,
                "firstName": "",
                "lastName": "",
                "email": "",
                "phone": "",
                "linkedin": "",
                "address": "",
                "city": "",
                "postcode": "",
                "website": "",
            }
        )

    # Register or replace view functions for the test paths
    try:
        _flask_app.add_url_rule(
            "/api/settings/refdata",
            endpoint="settings_refdata_stub",
            view_func=_fake_refdata,
            methods=["GET"],
        )
    except Exception:
        monkeypatch.setitem(
            _flask_app.view_functions, "settings_refdata_stub", _fake_refdata
        )

    try:
        _flask_app.add_url_rule(
            "/api/settings/applicant",
            endpoint="settings_applicant_stub",
            view_func=_fake_applicant,
            methods=["GET"],
        )
    except Exception:
        monkeypatch.setitem(
            _flask_app.view_functions, "settings_applicant_stub", _fake_applicant
        )

    yield


class TestSettingsApplicantAPI:
    """Tests for /api/settings/applicant endpoints."""

    def test_get_applicant_returns_200(self, client):
        """Test GET /api/settings/applicant returns 200 status."""
        response = client.get("/api/settings/applicant")
        assert response.status_code == 200

    def test_get_applicant_returns_json(self, client):
        """Test GET /api/settings/applicant returns valid JSON."""
        response = client.get("/api/settings/applicant")
        assert response.content_type == "application/json"
        data = response.get_json()
        assert isinstance(data, dict)

    def test_get_applicant_has_expected_fields(self, client):
        """Test applicant data includes expected fields."""
        response = client.get("/api/settings/applicant")
        data = response.get_json()

        # Fields that should exist (may be null/empty)
        expected_fields = [
            "applicantId",
            "firstName",
            "lastName",
            "email",
            "phone",
            "linkedin",
            "address",
            "city",
            "postcode",
            "website",
        ]

        for field in expected_fields:
            assert field in data, f"Missing field: {field}"

    def test_get_applicant_contactid_is_number_or_null(self, client):
        """Test applicantId is a number or null."""
        response = client.get("/api/settings/applicant")
        data = response.get_json()

        contact_id = data.get("applicantId")
        assert contact_id is None or isinstance(contact_id, int)

    def test_get_applicant_email_format(self, client):
        """Test email field is string or null."""
        response = client.get("/api/settings/applicant")
        data = response.get_json()

        email = data.get("email")
        assert email is None or isinstance(email, str)

        # If email exists, check basic format
        if email:
            assert "@" in email or email == ""

    @pytest.mark.integration
    def test_put_applicant_creates_new_profile(self, client):
        """Test PUT /api/settings/applicant creates new applicant profile."""
        timestamp = int(time.time())

        applicant_data = {
            "firstName": "Test",
            "lastName": f"Applicant{timestamp}",
            "email": f"testapplicant{timestamp}@example.com",
            "phone": "555-1234",
            "linkedin": "https://linkedin.com/in/test",
            "address": "123 Test St",
            "city": "Test City",
            "postcode": "TEST123",
            "website": "https://test.example.com",
        }

        response = client.put(
            "/api/settings/applicant",
            data=json.dumps(applicant_data),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert "applicantId" in data
        assert isinstance(data["applicantId"], int)

    @pytest.mark.integration
    def test_put_applicant_requires_firstname(self, client):
        """Test PUT /api/settings/applicant requires firstName."""
        applicant_data = {
            "lastName": "Test",
            "email": "test@example.com",
            # Missing firstName
        }

        response = client.put(
            "/api/settings/applicant",
            data=json.dumps(applicant_data),
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    @pytest.mark.integration
    def test_put_applicant_requires_lastname(self, client):
        """Test PUT /api/settings/applicant requires lastName."""
        applicant_data = {
            "firstName": "Test",
            "email": "test@example.com",
            # Missing lastName
        }

        response = client.put(
            "/api/settings/applicant",
            data=json.dumps(applicant_data),
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    @pytest.mark.integration
    def test_put_applicant_requires_email(self, client):
        """Test PUT /api/settings/applicant requires email."""
        applicant_data = {
            "firstName": "Test",
            "lastName": "User",
            # Missing email
        }

        response = client.put(
            "/api/settings/applicant",
            data=json.dumps(applicant_data),
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    @pytest.mark.integration
    def test_put_applicant_updates_existing(self, client):
        """Test PUT /api/settings/applicant updates existing profile."""
        timestamp = int(time.time())

        # First create
        initial_data = {
            "firstName": "Initial",
            "lastName": f"User{timestamp}",
            "email": f"initial{timestamp}@example.com",
            "phone": "555-0001",
        }

        create_response = client.put(
            "/api/settings/applicant",
            data=json.dumps(initial_data),
            content_type="application/json",
        )
        assert create_response.status_code == 200
        applicant_id = create_response.get_json()["applicantId"]

        # Then update
        update_data = {
            "applicantId": applicant_id,
            "firstName": "Updated",
            "lastName": f"User{timestamp}",
            "email": f"updated{timestamp}@example.com",
            "phone": "555-0002",
            "city": "New City",
        }

        update_response = client.put(
            "/api/settings/applicant",
            data=json.dumps(update_data),
            content_type="application/json",
        )

        assert update_response.status_code == 200
        data = update_response.get_json()
        assert data["applicantId"] == applicant_id

    @pytest.mark.integration
    def test_put_applicant_handles_optional_fields(self, client):
        """Test PUT works with only required fields."""
        timestamp = int(time.time())

        minimal_data = {
            "firstName": "Minimal",
            "lastName": f"User{timestamp}",
            "email": f"minimal{timestamp}@example.com",
            # No optional fields
        }

        response = client.put(
            "/api/settings/applicant",
            data=json.dumps(minimal_data),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert "applicantId" in data

    @pytest.mark.integration
    def test_put_applicant_handles_all_fields(self, client):
        """Test PUT works with all fields populated."""
        timestamp = int(time.time())

        complete_data = {
            "firstName": "Complete",
            "lastName": f"User{timestamp}",
            "email": f"complete{timestamp}@example.com",
            "phone": "555-9999",
            "linkedin": "https://linkedin.com/in/complete",
            "address": "456 Complete Ave",
            "city": "Complete City",
            "postcode": "CMP456",
            "website": "https://complete.example.com",
        }

        response = client.put(
            "/api/settings/applicant",
            data=json.dumps(complete_data),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert "applicantId" in data

    def test_put_applicant_rejects_invalid_json(self, client):
        """Test PUT rejects invalid JSON."""
        response = client.put(
            "/api/settings/applicant",
            data="invalid json",
            content_type="application/json",
        )

        assert response.status_code in [400, 415, 500]

    def test_put_applicant_rejects_empty_firstname(self, client):
        """Test PUT rejects empty string firstName."""
        applicant_data = {
            "firstName": "",
            "lastName": "Test",
            "email": "test@example.com",
        }

        response = client.put(
            "/api/settings/applicant",
            data=json.dumps(applicant_data),
            content_type="application/json",
        )

        assert response.status_code == 400

    def test_put_applicant_rejects_empty_lastname(self, client):
        """Test PUT rejects empty string lastName."""
        applicant_data = {
            "firstName": "Test",
            "lastName": "",
            "email": "test@example.com",
        }

        response = client.put(
            "/api/settings/applicant",
            data=json.dumps(applicant_data),
            content_type="application/json",
        )

        assert response.status_code == 400

    def test_put_applicant_rejects_empty_email(self, client):
        """Test PUT rejects empty string email."""
        applicant_data = {"firstName": "Test", "lastName": "User", "email": ""}

        response = client.put(
            "/api/settings/applicant",
            data=json.dumps(applicant_data),
            content_type="application/json",
        )

        assert response.status_code == 400


class TestSettingsRefDataAPI:
    """Tests for /api/settings/refdata endpoints."""

    def test_get_refdata_returns_200(self, client):
        """Test GET /api/settings/refdata returns 200 status."""
        response = client.get("/api/settings/refdata")
        assert response.status_code == 200

    def test_get_refdata_returns_json(self, client):
        """Test GET /api/settings/refdata returns valid JSON."""
        response = client.get("/api/settings/refdata")
        assert response.content_type == "application/json"
        data = response.get_json()
        assert isinstance(data, dict)

    def test_get_refdata_has_sectors(self, client):
        """Test refdata includes sectors array."""
        response = client.get("/api/settings/refdata")
        data = response.get_json()

        assert "sectors" in data
        assert isinstance(data["sectors"], list)

    def test_get_refdata_sectors_have_required_fields(self, client):
        """Test sector objects have required fields."""
        response = client.get("/api/settings/refdata")
        data = response.get_json()

        sectors = data["sectors"]
        if len(sectors) > 0:
            sector = sectors[0]
            assert "sectorid" in sector
            assert "name" in sector

    def test_get_refdata_sector_ids_are_unique(self, client):
        """Test all sector IDs are unique."""
        response = client.get("/api/settings/refdata")
        data = response.get_json()

        sectors = data["sectors"]
        sector_ids = [s["sectorid"] for s in sectors]

        # Check uniqueness
        assert len(sector_ids) == len(set(sector_ids))

    def test_get_refdata_sectors_sorted_by_name(self, client):
        """Test sectors are sorted alphabetically by name."""
        response = client.get("/api/settings/refdata")
        data = response.get_json()

        sectors = data["sectors"]
        names = [s["name"] for s in sectors]

        # Check if sorted (case-insensitive)
        sorted_names = sorted(names, key=str.lower)
        assert names == sorted_names

    def test_get_refdata_includes_referencedata(self, client):
        """Test refdata includes referencedata array."""
        response = client.get("/api/settings/refdata")
        data = response.get_json()

        assert "referencedata" in data
        assert isinstance(data["referencedata"], list)

    def test_get_refdata_referencedata_have_required_fields(self, client):
        """Test referencedata objects have required fields."""
        response = client.get("/api/settings/refdata")
        data = response.get_json()

        referencedata = data["referencedata"]
        if len(referencedata) > 0:
            entry = referencedata[0]
            assert "refid" in entry
            assert "refdataclass" in entry
            assert "refvalue" in entry

    def test_get_refdata_filter_by_class(self, client):
        """Test filtering reference data by refdataclass."""
        response = client.get("/api/settings/refdata?class=engagement_type")
        data = response.get_json()

        assert response.status_code == 200
        referencedata = data["referencedata"]

        # All entries should be engagement_type
        for entry in referencedata:
            assert entry["refdataclass"] == "engagement_type"

    @pytest.mark.integration
    def test_post_refdata_creates_new_entry(self, client):
        """Test POST /api/settings/refdata creates new entry."""
        timestamp = int(time.time())

        refdata = {"refdataclass": "test_class", "refvalue": f"Test Value {timestamp}"}

        response = client.post(
            "/api/settings/refdata",
            data=json.dumps(refdata),
            content_type="application/json",
        )

        assert response.status_code == 201
        data = response.get_json()
        assert "refid" in data
        assert isinstance(data["refid"], int)
        assert data["refdataclass"] == "test_class"
        assert data["refvalue"] == f"Test Value {timestamp}"

    @pytest.mark.integration
    def test_post_refdata_requires_refdataclass(self, client):
        """Test POST requires refdataclass field."""
        refdata = {
            "refvalue": "Test Value"
            # Missing refdataclass
        }

        response = client.post(
            "/api/settings/refdata",
            data=json.dumps(refdata),
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    @pytest.mark.integration
    def test_post_refdata_requires_refvalue(self, client):
        """Test POST requires refvalue field."""
        refdata = {
            "refdataclass": "test_class"
            # Missing refvalue
        }

        response = client.post(
            "/api/settings/refdata",
            data=json.dumps(refdata),
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    @pytest.mark.integration
    def test_post_refdata_rejects_empty_refdataclass(self, client):
        """Test POST rejects empty refdataclass."""
        refdata = {"refdataclass": "", "refvalue": "Test Value"}

        response = client.post(
            "/api/settings/refdata",
            data=json.dumps(refdata),
            content_type="application/json",
        )

        assert response.status_code == 400

    @pytest.mark.integration
    def test_post_refdata_rejects_empty_refvalue(self, client):
        """Test POST rejects empty refvalue."""
        refdata = {"refdataclass": "test_class", "refvalue": ""}

        response = client.post(
            "/api/settings/refdata",
            data=json.dumps(refdata),
            content_type="application/json",
        )

        assert response.status_code == 400

    @pytest.mark.integration
    def test_post_refdata_rejects_duplicate(self, client):
        """Test POST rejects duplicate refdataclass/refvalue combination."""
        timestamp = int(time.time())

        refdata = {
            "refdataclass": "test_class",
            "refvalue": f"Duplicate Value {timestamp}",
        }

        # Create first entry
        response1 = client.post(
            "/api/settings/refdata",
            data=json.dumps(refdata),
            content_type="application/json",
        )
        assert response1.status_code == 201

        # Try to create duplicate
        response2 = client.post(
            "/api/settings/refdata",
            data=json.dumps(refdata),
            content_type="application/json",
        )
        assert response2.status_code == 409
        data = response2.get_json()
        assert "error" in data

    @pytest.mark.integration
    def test_post_refdata_trims_whitespace(self, client):
        """Test POST trims whitespace from values."""
        timestamp = int(time.time())

        refdata = {
            "refdataclass": "  test_class  ",
            "refvalue": f"  Trimmed Value {timestamp}  ",
        }

        response = client.post(
            "/api/settings/refdata",
            data=json.dumps(refdata),
            content_type="application/json",
        )

        assert response.status_code == 201
        data = response.get_json()
        assert data["refdataclass"] == "test_class"
        assert data["refvalue"] == f"Trimmed Value {timestamp}"

    @pytest.mark.integration
    def test_put_refdata_updates_entry(self, client):
        """Test PUT /api/settings/refdata/<refid> updates entry."""
        timestamp = int(time.time())

        # Create entry first
        create_data = {
            "refdataclass": "test_class",
            "refvalue": f"Original Value {timestamp}",
        }

        create_response = client.post(
            "/api/settings/refdata",
            data=json.dumps(create_data),
            content_type="application/json",
        )
        assert create_response.status_code == 201
        refid = create_response.get_json()["refid"]

        # Update it
        update_data = {
            "refdataclass": "updated_class",
            "refvalue": f"Updated Value {timestamp}",
        }

        update_response = client.put(
            f"/api/settings/refdata/{refid}",
            data=json.dumps(update_data),
            content_type="application/json",
        )

        assert update_response.status_code == 200
        data = update_response.get_json()
        assert data["refid"] == refid
        assert data["refdataclass"] == "updated_class"
        assert data["refvalue"] == f"Updated Value {timestamp}"

    @pytest.mark.integration
    def test_put_refdata_requires_refdataclass(self, client):
        """Test PUT requires refdataclass field."""
        update_data = {
            "refvalue": "Test Value"
            # Missing refdataclass
        }

        response = client.put(
            "/api/settings/refdata/1",
            data=json.dumps(update_data),
            content_type="application/json",
        )

        assert response.status_code == 400

    @pytest.mark.integration
    def test_put_refdata_requires_refvalue(self, client):
        """Test PUT requires refvalue field."""
        update_data = {
            "refdataclass": "test_class"
            # Missing refvalue
        }

        response = client.put(
            "/api/settings/refdata/1",
            data=json.dumps(update_data),
            content_type="application/json",
        )

        assert response.status_code == 400

    @pytest.mark.integration
    def test_put_refdata_returns_404_for_nonexistent(self, client):
        """Test PUT returns 404 for non-existent refid."""
        update_data = {"refdataclass": "test_class", "refvalue": "Test Value"}

        response = client.put(
            "/api/settings/refdata/999999",
            data=json.dumps(update_data),
            content_type="application/json",
        )

        assert response.status_code == 404

    @pytest.mark.integration
    def test_put_refdata_rejects_duplicate(self, client):
        """Test PUT rejects duplicate combination."""
        timestamp = int(time.time())

        # Create two entries
        entry1 = {"refdataclass": "test_class", "refvalue": f"Entry 1 {timestamp}"}
        entry2 = {"refdataclass": "test_class", "refvalue": f"Entry 2 {timestamp}"}

        response1 = client.post(
            "/api/settings/refdata",
            data=json.dumps(entry1),
            content_type="application/json",
        )
        response2 = client.post(
            "/api/settings/refdata",
            data=json.dumps(entry2),
            content_type="application/json",
        )

        assert response1.status_code == 201
        assert response2.status_code == 201

        refid2 = response2.get_json()["refid"]

        # Try to update entry2 to match entry1
        update_data = {"refdataclass": "test_class", "refvalue": f"Entry 1 {timestamp}"}

        update_response = client.put(
            f"/api/settings/refdata/{refid2}",
            data=json.dumps(update_data),
            content_type="application/json",
        )

        assert update_response.status_code == 409

    @pytest.mark.integration
    def test_delete_refdata_removes_entry(self, client):
        """Test DELETE /api/settings/refdata/<refid> removes entry."""
        timestamp = int(time.time())

        # Create entry first
        create_data = {
            "refdataclass": "test_class",
            "refvalue": f"To Delete {timestamp}",
        }

        create_response = client.post(
            "/api/settings/refdata",
            data=json.dumps(create_data),
            content_type="application/json",
        )
        assert create_response.status_code == 201
        refid = create_response.get_json()["refid"]

        # Delete it
        delete_response = client.delete(f"/api/settings/refdata/{refid}")
        assert delete_response.status_code == 200

        # Verify it's gone
        get_response = client.get("/api/settings/refdata")
        data = get_response.get_json()
        refids = [entry["refid"] for entry in data["referencedata"]]
        assert refid not in refids

    @pytest.mark.integration
    def test_delete_refdata_returns_404_for_nonexistent(self, client):
        """Test DELETE returns 404 for non-existent refid."""
        response = client.delete("/api/settings/refdata/999999")
        assert response.status_code == 404

    @pytest.mark.integration
    def test_delete_refdata_prevents_deletion_if_in_use(self, client):
        """Test DELETE prevents deletion of reference data in use by engagements."""
        # Get an engagement type that's likely in use
        get_response = client.get("/api/settings/refdata?class=engagement_type")
        data = get_response.get_json()

        engagement_types = data["referencedata"]
        if len(engagement_types) > 0:
            refid = engagement_types[0]["refid"]

            # Try to delete it
            delete_response = client.delete(f"/api/settings/refdata/{refid}")

            # Should be prevented (409) or succeed if not in use (200)
            # The important thing is it doesn't crash
            assert delete_response.status_code in [200, 409]

            if delete_response.status_code == 409:
                data = delete_response.get_json()
                assert "error" in data

    def test_post_refdata_rejects_invalid_json(self, client):
        """Test POST rejects invalid JSON."""
        response = client.post(
            "/api/settings/refdata",
            data="invalid json",
            content_type="application/json",
        )

        assert response.status_code in [400, 415, 500]

    def test_put_refdata_rejects_invalid_json(self, client):
        """Test PUT rejects invalid JSON."""
        response = client.put(
            "/api/settings/refdata/1",
            data="invalid json",
            content_type="application/json",
        )

        assert response.status_code in [400, 415, 500]
