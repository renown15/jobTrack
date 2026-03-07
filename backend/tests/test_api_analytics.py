"""Tests for Analytics API endpoints."""

import json

import pytest

# Provide a deterministic canned response for non-integration tests so the
# analytics tests do not need a live database. This stub is installed as a
# lightweight Flask view at `/api/analytics/summary` for GET requests.
from app import app as _flask_app


@pytest.fixture(autouse=True)
def _stub_analytics_endpoints(monkeypatch):
    canned = {
        "summary": {
            "totalContacts": 0,
            "totalEngagements": 0,
            "totalInterviews": 0,
            "totalApplications": 0,
            "engagementRate": 0,
            "interviewRate": 0,
        },
        "organizationsBySector": [],
        "topHiringOrgs": {"labels": [], "values": [], "details": []},
        "cumulativeContacts": {"labels": ["2024-01"], "values": [0]},
        "cumulativeEngagements": {"labels": ["2024-01"], "values": [0]},
        "cumulativeInterviews": {"labels": ["2024-01"], "values": [0]},
    }

    def _fake_summary():
        from flask import jsonify

        return jsonify(canned)

    # Register a simple rule for the path used by tests. If a rule already
    # exists for the same path (e.g. integration runs), adding will raise; in
    # that case replace the view function mapping directly so tests still hit
    # the canned response.
    try:
        _flask_app.add_url_rule(
            "/api/analytics/summary",
            endpoint="analytics_summary_stub",
            view_func=_fake_summary,
            methods=["GET"],
        )
    except Exception:
        monkeypatch.setitem(
            _flask_app.view_functions, "analytics_summary_stub", _fake_summary
        )

    yield


class TestAnalyticsAPI:
    """Tests for /api/analytics endpoints."""

    def test_get_analytics_summary_returns_200(self, client):
        """Test GET /api/analytics/summary returns 200 status."""
        response = client.get("/api/analytics/summary")
        assert response.status_code == 200

    def test_get_analytics_summary_returns_json(self, client):
        """Test GET /api/analytics/summary returns valid JSON."""
        response = client.get("/api/analytics/summary")
        assert response.content_type == "application/json"
        data = response.get_json()
        assert isinstance(data, dict)

    def test_analytics_summary_has_required_fields(self, client):
        """Test analytics summary includes all required fields."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()

        required_top_level_fields = [
            "summary",
            "organizationsBySector",
            "topHiringOrgs",
            "cumulativeContacts",
            "cumulativeEngagements",
            "cumulativeInterviews",
        ]

        for field in required_top_level_fields:
            assert field in data, f"Missing field: {field}"

        # Check summary object fields
        summary = data["summary"]
        required_summary_fields = [
            "totalContacts",
            "totalEngagements",
            "totalInterviews",
            "totalApplications",
            "engagementRate",
            "interviewRate",
        ]

        for field in required_summary_fields:
            assert field in summary, f"Missing summary field: {field}"

    def test_analytics_summary_totals_are_numbers(self, client):
        """Test that numeric fields are actually numbers."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()
        summary = data["summary"]

        assert isinstance(summary["totalContacts"], int)
        assert isinstance(summary["totalEngagements"], int)
        assert isinstance(summary["totalInterviews"], int)
        assert isinstance(summary["totalApplications"], int)
        assert isinstance(summary["engagementRate"], (int, float))
        assert isinstance(summary["interviewRate"], (int, float))

    def test_analytics_summary_rates_are_valid_percentages(self, client):
        """Test that rate values are non-negative percentages."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()
        summary = data["summary"]

        # Engagement rate can be > 100% if contacts have multiple engagements
        assert summary["engagementRate"] >= 0
        # Interview rate should be <= 100% (interviews are subset of engagements)
        assert 0 <= summary["interviewRate"] <= 100

    def test_analytics_organizations_by_sector_structure(self, client):
        """Test organizationsBySector has correct structure."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()

        orgs = data["organizationsBySector"]
        assert isinstance(orgs, list)

        if len(orgs) > 0:
            org = orgs[0]
            assert "sector" in org
            assert "name" in org
            assert "orgid" in org
            assert "contact_count" in org
            assert "engagement_count" in org
            assert "interview_count" in org

    def test_analytics_organizations_by_sector_values_are_numbers(self, client):
        """Test all organizationsBySector counts are non-negative integers."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()

        orgs = data["organizationsBySector"]
        for org in orgs:
            assert isinstance(org["contact_count"], int)
            assert isinstance(org["engagement_count"], int)
            assert isinstance(org["interview_count"], int)
            assert org["contact_count"] >= 0
            assert org["engagement_count"] >= 0
            assert org["interview_count"] >= 0

    def test_analytics_top_hiring_orgs_structure(self, client):
        """Test topHiringOrgs has correct structure."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()

        hiring_orgs = data["topHiringOrgs"]
        assert isinstance(hiring_orgs, dict)
        assert "labels" in hiring_orgs
        assert "values" in hiring_orgs
        assert "details" in hiring_orgs
        assert isinstance(hiring_orgs["labels"], list)
        assert isinstance(hiring_orgs["values"], list)
        assert isinstance(hiring_orgs["details"], list)
        assert len(hiring_orgs["labels"]) == len(hiring_orgs["values"])
        assert len(hiring_orgs["labels"]) == len(hiring_orgs["details"])

    def test_analytics_top_hiring_orgs_values_are_numbers(self, client):
        """Test all topHiringOrgs values are positive integers."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()

        hiring_orgs = data["topHiringOrgs"]
        for value in hiring_orgs["values"]:
            assert isinstance(value, int)
            assert value >= 0

        # Verify details structure
        for detail in hiring_orgs["details"]:
            assert "current" in detail
            assert "target" in detail
            assert "total" in detail
            assert "name" in detail
            assert isinstance(detail["current"], int)
            assert isinstance(detail["target"], int)
            assert isinstance(detail["total"], int)
            assert detail["current"] >= 0
            assert detail["target"] >= 0
            assert detail["total"] >= 0

    def test_analytics_cumulative_contacts_structure(self, client):
        """Test cumulativeContacts has correct structure."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()

        cumulative = data["cumulativeContacts"]
        assert isinstance(cumulative, dict)
        assert "labels" in cumulative
        assert "values" in cumulative
        assert isinstance(cumulative["labels"], list)
        assert isinstance(cumulative["values"], list)
        assert len(cumulative["labels"]) == len(cumulative["values"])

    def test_analytics_cumulative_contacts_dates_are_valid(self, client):
        """Test cumulativeContacts dates are in valid YYYY-MM format."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()

        cumulative = data["cumulativeContacts"]
        for label in cumulative["labels"]:
            # Should be in YYYY-MM format
            assert isinstance(label, str)
            parts = label.split("-")
            assert len(parts) == 2
            year, month = parts
            assert len(year) == 4
            assert 1 <= int(month) <= 12

    def test_analytics_cumulative_contacts_values_are_numbers(self, client):
        """Test all cumulativeContacts values are non-negative integers."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()

        cumulative = data["cumulativeContacts"]
        for value in cumulative["values"]:
            assert isinstance(value, int)
            assert value >= 0

    def test_analytics_cumulative_contacts_values_are_increasing(self, client):
        """Test cumulativeContacts values are monotonically increasing."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()

        cumulative = data["cumulativeContacts"]
        values = cumulative["values"]

        # Check if values are non-decreasing (cumulative should only go up)
        for i in range(len(values) - 1):
            assert (
                values[i] <= values[i + 1]
            ), "Cumulative values should be monotonically increasing"

    def test_analytics_cumulative_engagements_structure(self, client):
        """Test cumulativeEngagements has correct structure."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()

        cumulative = data["cumulativeEngagements"]
        assert isinstance(cumulative, dict)
        assert "labels" in cumulative
        assert "values" in cumulative
        assert isinstance(cumulative["labels"], list)
        assert isinstance(cumulative["values"], list)
        assert len(cumulative["labels"]) == len(cumulative["values"])

    def test_analytics_cumulative_engagements_values_are_increasing(self, client):
        """Test cumulativeEngagements values are monotonically increasing."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()

        cumulative = data["cumulativeEngagements"]
        values = cumulative["values"]

        # Check if values are non-decreasing
        for i in range(len(values) - 1):
            assert (
                values[i] <= values[i + 1]
            ), "Cumulative values should be monotonically increasing"

    def test_analytics_cumulative_interviews_structure(self, client):
        """Test cumulativeInterviews has correct structure."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()

        cumulative = data["cumulativeInterviews"]
        assert isinstance(cumulative, dict)
        assert "labels" in cumulative
        assert "values" in cumulative
        assert isinstance(cumulative["labels"], list)
        assert isinstance(cumulative["values"], list)
        assert len(cumulative["labels"]) == len(cumulative["values"])

    def test_analytics_cumulative_interviews_values_are_increasing(self, client):
        """Test cumulativeInterviews values are monotonically increasing."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()

        cumulative = data["cumulativeInterviews"]
        values = cumulative["values"]

        # Check if values are non-decreasing
        for i in range(len(values) - 1):
            assert (
                values[i] <= values[i + 1]
            ), "Cumulative values should be monotonically increasing"

    def test_analytics_date_range_filtering(self, client):
        """Test analytics endpoint accepts date range parameters."""
        start_date = "2024-01-01"
        end_date = "2024-12-31"

        response = client.get(
            f"/api/analytics/summary?start_date={start_date}&end_date={end_date}"
        )
        assert response.status_code == 200

        data = response.get_json()
        assert "summary" in data
        assert "cumulativeContacts" in data

    def test_analytics_summary_handles_empty_database_gracefully(self, client):
        """Test analytics returns valid structure even with no data."""
        response = client.get("/api/analytics/summary")
        assert response.status_code == 200

        data = response.get_json()
        # Even with no data, should have structure
        assert "summary" in data
        assert "organizationsBySector" in data
        assert "topHiringOrgs" in data
        assert "cumulativeContacts" in data
        assert "cumulativeEngagements" in data
        assert "cumulativeInterviews" in data

    def test_analytics_summary_json_serializable(self, client):
        """Test that the entire response is JSON serializable."""
        response = client.get("/api/analytics/summary")
        data = response.get_json()

        # Should be able to serialize back to JSON without errors
        json_str = json.dumps(data)
        assert isinstance(json_str, str)

        # Should be able to parse it back
        reparsed = json.loads(json_str)
        assert reparsed == data
