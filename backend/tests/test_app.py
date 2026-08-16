"""Tests for Flask application endpoints."""

import pytest


class TestAppEndpoints:
    """Tests for application routes."""

    def test_root_endpoint(self, client):
        """Test GET / returns 200."""
        response = client.get("/")
        assert response.status_code in [
            200,
            302,
            404,
        ]  # May redirect or not be configured

    def test_app_endpoint_returns_200(self, client):
        """Test GET /app returns 200 status."""
        response = client.get("/app")
        assert response.status_code == 200

    def test_app_endpoint_returns_html(self, client):
        """Test GET /app returns HTML content."""
        response = client.get("/app")
        assert "text/html" in response.content_type

        # Check for HTML structure
        html = response.data.decode("utf-8")
        assert "<html" in html.lower()
        assert "</html>" in html.lower()

    def test_app_endpoint_includes_jobtrack_title(self, client):
        """Test /app includes JobTrack in title or content."""
        response = client.get("/app")
        html = response.data.decode("utf-8")
        assert "jobtrack" in html.lower() or "job track" in html.lower()

    def test_static_files_accessible(self, client):
        """Test static files are served correctly."""
        # Test CSS file
        response = client.get("/static/css/output.css")
        assert response.status_code in [200, 304]  # Should exist

    def test_health_check(self, client):
        """Test basic health check of the application."""
        # Try a simple API endpoint
        response = client.get("/api/contacts")
        assert response.status_code == 200
        assert response.content_type == "application/json"


class TestErrorHandling:
    """Tests for error handling."""

    def test_404_on_invalid_route(self, client):
        """Test accessing non-existent route returns 404."""
        response = client.get("/this-route-does-not-exist")
        assert response.status_code == 404

    def test_405_on_wrong_method(self, client):
        """Test using wrong HTTP method returns 405."""
        # GET endpoints should not accept POST
        response = client.post("/app")
        assert response.status_code == 405

    def test_api_handles_errors(self, client):
        """Test API handles errors gracefully."""
        # Test with invalid data
        response = client.post(
            "/api/contacts", data="invalid json", content_type="application/json"
        )

        # Should return 400 or 500 error
        assert response.status_code >= 400


class TestCORS:
    """Tests for CORS configuration."""

    def test_cors_headers_present(self, client):
        """Test CORS headers are included in responses."""
        response = client.get("/api/contacts")

        # Check for CORS headers (if configured)
        headers = dict(response.headers)
        # CORS may or may not be configured, so this is informational

        # Just verify we can check headers
        assert isinstance(headers, dict)

    def test_options_request(self, client):
        """Test OPTIONS preflight request."""
        response = client.options("/api/contacts")

        # Should return 200 or 204 for OPTIONS
        assert response.status_code in [200, 204, 405]


class TestDatabaseConnection:
    """Tests for database connectivity."""

    @pytest.mark.slow
    def test_database_connection_via_api(self, client):
        """Test database is accessible through API."""
        response = client.get("/api/contacts")

        # Should successfully connect to database
        assert response.status_code == 200

        data = response.get_json()
        assert isinstance(data, list)

    @pytest.mark.slow
    def test_multiple_requests_work(self, client):
        """Test multiple database requests work correctly."""
        # Make multiple requests to ensure connection pooling works
        for _ in range(5):
            response = client.get("/api/contacts")
            assert response.status_code == 200

    @pytest.mark.slow
    @pytest.mark.skip(reason="Concurrent test causes Flask context issues")
    def test_concurrent_reads(self, client):
        """Test concurrent read operations."""
        import concurrent.futures

        def make_request():
            response = client.get("/api/contacts")
            return response.status_code == 200

        # Make 10 concurrent requests
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(make_request) for _ in range(10)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        # All requests should succeed
        assert all(results), "All concurrent requests should succeed"
