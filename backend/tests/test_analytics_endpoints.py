import pytest


@pytest.mark.integration
def test_top_analytics_endpoints_accept_get(client):
    """Integration test: ensure analytics endpoints accept GET requests.

    Uses the shared `client` fixture which configures session/applicantid
    and runs against the application connected to the integration test DB.
    """
    urls = [
        "/api/1/analytics/top_contacts_by_engagements",
        "/api/1/analytics/top_recent_contacts",
    ]

    for u in urls:
        resp = client.get(u)
        # If the route exists but disallows GET, Flask returns 405.
        assert resp.status_code != 405, f"Endpoint {u} returned 405 METHOD NOT ALLOWED"
        # Expect 200 OK and an array payload (analytics endpoints should return lists)
        assert resp.status_code == 200, f"Unexpected status for {u}: {resp.status_code}"
        data = resp.get_json()
        assert isinstance(
            data, list
        ), f"Expected list payload from {u}, got {type(data)}"
