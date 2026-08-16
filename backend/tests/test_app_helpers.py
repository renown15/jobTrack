from app import app
from jobtrack_core.request_utils import (
    parse_applicantid_from_body,
    require_applicant_allowed,
)


def test_parse_applicantid_from_body_returns_int_when_present():
    with app.test_request_context("/", method="POST", json={"applicantid": 5}):
        val = parse_applicantid_from_body()
        assert isinstance(val, int) and val == 5


def test_parse_applicantid_from_body_returns_none_when_missing():
    with app.test_request_context("/", method="POST", json={}):
        val = parse_applicantid_from_body()
        assert val is None


def test_parse_applicantid_from_body_returns_none_on_invalid():
    with app.test_request_context(
        "/", method="POST", json={"applicantid": "not-an-int"}
    ):
        val = parse_applicantid_from_body()
        assert val is None


def test_require_applicant_allowed_behaviour():
    # No session -> not authenticated
    with app.test_request_context("/"):
        # ensure session is empty
        rv = require_applicant_allowed(1)
        assert rv is not None and rv[1] == 401

    # Session mismatch -> 403
    from flask import session as flask_session

    with app.test_request_context("/"):
        flask_session["applicantid"] = 2
        rv = require_applicant_allowed(1)
        assert rv is not None and rv[1] == 403

    # Session invalid (non-int) -> 400
    with app.test_request_context("/"):
        flask_session["applicantid"] = "bad"
        rv = require_applicant_allowed(1)
        assert rv is not None and rv[1] == 400

    # Session match -> None (allowed)
    with app.test_request_context("/"):
        flask_session["applicantid"] = 1
        rv = require_applicant_allowed(1)
        assert rv is None
