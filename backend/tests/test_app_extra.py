"""Lightweight tests for a few auth-related endpoints in `app.py`.

Deprecated LLM helper tests were removed because AI/LMM functionality
is now implemented in `jobtrack_navigator_ai`. This file keeps only
tests that exercise auth/logout and /api/auth/me behavior.
"""


def test_api_logout_and_me_endpoints(client):
    """Test logout always returns ok, and /api/auth/me returns 401 when not authenticated."""
    # Ensure no session present; logout should still return ok
    resp = client.post("/api/auth/logout")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data.get("ok") is True

    # /api/auth/me should return 401 when not logged in
    resp2 = client.get("/api/auth/me")
    assert resp2.status_code == 401
    data2 = resp2.get_json()
    assert data2.get("ok") is False
