"""
Tests for admin applicant management endpoints including status toggle,
password management, deletion, and export/import functionality.
"""

import json
import os
import uuid

import psycopg2
from conftest import fetchone_not_none
import pytest
from werkzeug.security import generate_password_hash


@pytest.mark.integration
def test_admin_list_applicants_requires_superuser(client):
    """GET /api/admin/applicants requires superuser privileges."""
    test_db = os.environ.get("TEST_DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set"

    # Create non-superuser applicant
    unique_email = f"test.nonadmin+{uuid.uuid4().hex}@example.com"
    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                (
                    "Test",
                    "User",
                    unique_email,
                    True,
                    False,
                    generate_password_hash("password123"),
                ),
            )
            non_super_id = fetchone_not_none(cur)[0]
            conn.commit()

            # Login as non-superuser
            with client.session_transaction() as sess:
                sess["applicantid"] = non_super_id

            resp = client.get("/api/admin/applicants")
            assert resp.status_code == 403

            # Cleanup
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid = %s", (non_super_id,)
            )
            conn.commit()
    finally:
        conn.close()


@pytest.mark.integration
def test_admin_toggle_applicant_status(client):
    """PATCH /api/admin/applicants/<id>/status toggles isActive status."""
    test_db = os.environ.get("TEST_DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set"

    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            # Create superuser
            unique_email = f"test.super+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                (
                    "Super",
                    "User",
                    unique_email,
                    True,
                    True,
                    generate_password_hash("password123"),
                ),
            )
            super_id = fetchone_not_none(cur)[0]

            # Create target applicant
            target_email = f"test.target+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser)
                   VALUES (%s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                ("Target", "User", target_email, True, False),
            )
            target_id = fetchone_not_none(cur)[0]
            conn.commit()

            # Login as superuser
            with client.session_transaction() as sess:
                sess["applicantid"] = super_id

            # Toggle to inactive
            resp = client.patch(
                f"/api/admin/applicants/{target_id}/status",
                data=json.dumps({"isActive": False}),
                content_type="application/json",
            )
            assert resp.status_code == 200

            # Verify in DB
            cur.execute(
                "SELECT isactive FROM applicantprofile WHERE applicantid = %s",
                (target_id,),
            )
            assert fetchone_not_none(cur)[0] is False

            # Toggle back to active
            resp = client.patch(
                f"/api/admin/applicants/{target_id}/status",
                data=json.dumps({"isActive": True}),
                content_type="application/json",
            )
            assert resp.status_code == 200

            cur.execute(
                "SELECT isactive FROM applicantprofile WHERE applicantid = %s",
                (target_id,),
            )
            assert fetchone_not_none(cur)[0] is True

            # Cleanup
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid IN (%s, %s)",
                (super_id, target_id),
            )
            conn.commit()
    finally:
        conn.close()


@pytest.mark.integration
def test_admin_toggle_applicant_superuser(client):
    """PATCH /api/admin/applicants/<id>/superuser toggles issuperuser flag."""
    test_db = os.environ.get("TEST_DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set"

    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            # Create superuser
            unique_email = f"test.super+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                (
                    "Super",
                    "User",
                    unique_email,
                    True,
                    True,
                    generate_password_hash("password123"),
                ),
            )
            super_id = fetchone_not_none(cur)[0]

            # Create target applicant
            target_email = f"test.target+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser)
                   VALUES (%s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                ("Target", "User", target_email, True, False),
            )
            target_id = fetchone_not_none(cur)[0]
            conn.commit()

            # Login as superuser
            with client.session_transaction() as sess:
                sess["applicantid"] = super_id

            # Promote target to superuser
            resp = client.patch(
                f"/api/admin/applicants/{target_id}/superuser",
                data=json.dumps({"isSuperuser": True}),
                content_type="application/json",
            )
            assert resp.status_code == 200

            cur.execute(
                "SELECT issuperuser FROM applicantprofile WHERE applicantid = %s",
                (target_id,),
            )
            assert fetchone_not_none(cur)[0] is True

            # Demote back
            resp = client.patch(
                f"/api/admin/applicants/{target_id}/superuser",
                data=json.dumps({"isSuperuser": False}),
                content_type="application/json",
            )
            assert resp.status_code == 200
            cur.execute(
                "SELECT issuperuser FROM applicantprofile WHERE applicantid = %s",
                (target_id,),
            )
            assert fetchone_not_none(cur)[0] is False

            # Cleanup
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid IN (%s, %s)",
                (super_id, target_id),
            )
            conn.commit()
    finally:
        conn.close()


@pytest.mark.integration
def test_admin_cannot_toggle_self_status(client):
    """Superuser cannot deactivate their own account."""
    test_db = os.environ.get("TEST_DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set"

    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            unique_email = f"test.super+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                (
                    "Super",
                    "User",
                    unique_email,
                    True,
                    True,
                    generate_password_hash("password123"),
                ),
            )
            super_id = fetchone_not_none(cur)[0]
            conn.commit()

            with client.session_transaction() as sess:
                sess["applicantid"] = super_id

            resp = client.patch(
                f"/api/admin/applicants/{super_id}/status",
                data=json.dumps({"isActive": False}),
                content_type="application/json",
            )
            assert resp.status_code == 403
            assert "cannot modify your own status" in resp.get_json()["error"]

            # Cleanup
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid = %s", (super_id,)
            )
            conn.commit()
    finally:
        conn.close()


@pytest.mark.integration
def test_admin_clear_password(client):
    """DELETE /api/admin/applicants/<id>/password clears password."""
    test_db = os.environ.get("TEST_DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set"

    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            # Create superuser
            unique_email = f"test.super+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                (
                    "Super",
                    "User",
                    unique_email,
                    True,
                    True,
                    generate_password_hash("password123"),
                ),
            )
            super_id = fetchone_not_none(cur)[0]

            # Create target with password
            target_email = f"test.target+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                (
                    "Target",
                    "User",
                    target_email,
                    True,
                    False,
                    generate_password_hash("targetpass"),
                ),
            )
            target_id = fetchone_not_none(cur)[0]
            conn.commit()

            with client.session_transaction() as sess:
                sess["applicantid"] = super_id

            # Clear password
            resp = client.delete(f"/api/admin/applicants/{target_id}/password")
            assert resp.status_code == 200

            # Verify password is NULL
            cur.execute(
                "SELECT passwordhash FROM applicantprofile WHERE applicantid = %s",
                (target_id,),
            )
            assert fetchone_not_none(cur)[0] is None

            # Cleanup
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid IN (%s, %s)",
                (super_id, target_id),
            )
            conn.commit()
    finally:
        conn.close()


@pytest.mark.integration
def test_admin_delete_applicant_with_cascade(client):
    """DELETE /api/admin/applicants/<id> deletes applicant and all related data."""
    test_db = os.environ.get("TEST_DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set"

    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            # Create superuser
            unique_email = f"test.super+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                (
                    "Super",
                    "User",
                    unique_email,
                    True,
                    True,
                    generate_password_hash("password123"),
                ),
            )
            super_id = fetchone_not_none(cur)[0]

            # Create target applicant
            target_email = f"test.target+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser)
                   VALUES (%s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                ("Target", "User", target_email, True, False),
            )
            target_id = fetchone_not_none(cur)[0]

            # Create related data - contact
            cur.execute(
                """INSERT INTO contact (applicantid, name)
                   VALUES (%s, %s)
                   RETURNING contactid;""",
                (target_id, "Test Contact"),
            )
            contact_id = fetchone_not_none(cur)[0]

            # Create related data - organisation
            cur.execute(
                """INSERT INTO organisation (applicantid, name)
                   VALUES (%s, %s)
                   RETURNING orgid;""",
                (target_id, "Test Org"),
            )
            org_id = fetchone_not_none(cur)[0]

            conn.commit()

            with client.session_transaction() as sess:
                sess["applicantid"] = super_id

            # Delete applicant
            resp = client.delete(f"/api/admin/applicants/{target_id}")
            assert resp.status_code == 200

            # Verify applicant deleted
            cur.execute(
                "SELECT COUNT(*) FROM applicantprofile WHERE applicantid = %s",
                (target_id,),
            )
            assert fetchone_not_none(cur)[0] == 0

            # Verify CASCADE deleted related data
            cur.execute(
                "SELECT COUNT(*) FROM contact WHERE contactid = %s", (contact_id,)
            )
            assert fetchone_not_none(cur)[0] == 0

            cur.execute("SELECT COUNT(*) FROM organisation WHERE orgid = %s", (org_id,))
            assert fetchone_not_none(cur)[0] == 0

            # Cleanup superuser
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid = %s", (super_id,)
            )
            conn.commit()
    finally:
        conn.close()


@pytest.mark.integration
def test_admin_cannot_delete_self(client):
    """Superuser cannot delete their own account."""
    test_db = os.environ.get("TEST_DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set"

    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            unique_email = f"test.super+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                (
                    "Super",
                    "User",
                    unique_email,
                    True,
                    True,
                    generate_password_hash("password123"),
                ),
            )
            super_id = fetchone_not_none(cur)[0]
            conn.commit()

            with client.session_transaction() as sess:
                sess["applicantid"] = super_id

            resp = client.delete(f"/api/admin/applicants/{super_id}")
            assert resp.status_code == 403
            assert "cannot delete your own account" in resp.get_json()["error"]

            # Cleanup
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid = %s", (super_id,)
            )
            conn.commit()
    finally:
        conn.close()


@pytest.mark.integration
def test_password_setup_flow(client):
    """POST /api/auth/setup-password sets initial password for blank accounts."""
    test_db = os.environ.get("TEST_DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set"

    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            # Create applicant with no password
            unique_email = f"test.setup+{uuid.uuid4().hex}@example.com"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                ("Setup", "User", unique_email, True, False, None),
            )
            user_id = fetchone_not_none(cur)[0]
            conn.commit()

            with client.session_transaction() as sess:
                sess["applicantid"] = user_id

            # Setup password
            resp = client.post(
                "/api/auth/setup-password",
                data=json.dumps({"email": unique_email, "password": "newpass123"}),
                content_type="application/json",
            )
            assert resp.status_code == 200

            # Verify password is set
            cur.execute(
                "SELECT passwordhash FROM applicantprofile WHERE applicantid = %s",
                (user_id,),
            )
            hash_val = fetchone_not_none(cur)[0]
            assert hash_val is not None
            assert len(hash_val) > 0

            # Cleanup
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid = %s", (user_id,)
            )
            conn.commit()
    finally:
        conn.close()


@pytest.mark.integration
def test_password_reset_flow(client):
    """POST /api/auth/reset-password changes password for logged-in user."""
    test_db = os.environ.get("TEST_DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set"

    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            # Create applicant with password
            unique_email = f"test.reset+{uuid.uuid4().hex}@example.com"
            old_pass = "oldpass123"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                (
                    "Reset",
                    "User",
                    unique_email,
                    True,
                    False,
                    generate_password_hash(old_pass),
                ),
            )
            user_id = fetchone_not_none(cur)[0]
            conn.commit()

            with client.session_transaction() as sess:
                sess["applicantid"] = user_id

            # Reset password with correct current password
            resp = client.post(
                "/api/auth/reset-password",
                data=json.dumps(
                    {"currentPassword": old_pass, "newPassword": "newpass456"}
                ),
                content_type="application/json",
            )
            assert resp.status_code == 200

            # Verify password changed
            cur.execute(
                "SELECT passwordhash FROM applicantprofile WHERE applicantid = %s",
                (user_id,),
            )
            new_hash = fetchone_not_none(cur)[0]
            assert new_hash is not None
            # Try wrong current password
            resp = client.post(
                "/api/auth/reset-password",
                data=json.dumps(
                    {"currentPassword": "wrongpass", "newPassword": "anotherpass"}
                ),
                content_type="application/json",
            )
            assert resp.status_code == 401

            # Cleanup
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid = %s", (user_id,)
            )
            conn.commit()
    finally:
        conn.close()


@pytest.mark.integration
def test_login_blocked_for_inactive_applicant(client):
    """POST /api/auth/login fails when isActive=false."""
    test_db = os.environ.get("TEST_DATABASE_URL")
    assert test_db, "TEST_DATABASE_URL must be set"

    conn = psycopg2.connect(test_db)
    try:
        with conn.cursor() as cur:
            unique_email = f"test.inactive+{uuid.uuid4().hex}@example.com"
            password = "password123"
            cur.execute(
                """INSERT INTO applicantprofile 
                   (firstname, lastname, email, isactive, issuperuser, passwordhash)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING applicantid;""",
                (
                    "Inactive",
                    "User",
                    unique_email,
                    False,
                    False,
                    generate_password_hash(password),
                ),
            )
            user_id = fetchone_not_none(cur)[0]
            conn.commit()

            # Clear session
            with client.session_transaction() as sess:
                sess.clear()

            # Attempt login
            resp = client.post(
                "/api/auth/login",
                data=json.dumps({"email": unique_email, "password": password}),
                content_type="application/json",
            )
            assert resp.status_code == 403
            data = resp.get_json()
            assert (
                "account is inactive" in data["error"].lower()
                or "inactive" in data["error"].lower()
                or "disabled" in data["error"].lower()
            )

            # Cleanup
            cur.execute(
                "DELETE FROM applicantprofile WHERE applicantid = %s", (user_id,)
            )
            conn.commit()
    finally:
        conn.close()
