"""Pytest configuration and fixtures for JobTrack tests."""

import json
import logging
import os
import sys
from typing import Generator, Any

import pytest


# Lightweight row proxy used by fake DB responses. It wraps a mapping and
# provides both positional access (row[0]) and mapping-style access
# (row.get('colname')) so tests can supply dicts while production code may
# use either access pattern.
class RowProxy(dict):
    """Dictionary subclass that also supports integer indexing by position.

    This makes the object JSON-serializable like a dict while still allowing
    positional access (row[0]) used in parts of the codebase.
    """

    def __init__(self, mapping):
        super().__init__(mapping)
        # Snapshot the values in insertion order for positional access
        self._values = tuple(super().values())

    def __getitem__(self, key):
        # Support integer indexing for positional access, otherwise behave
        # like a normal dict.
        if isinstance(key, int):
            return self._values[key]
        return super().__getitem__(key)

    def __repr__(self):
        return f"RowProxy({dict(self)!r})"


# Add parent directory to path to import app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Allow test runs to target a dedicated test database by setting
# `TEST_DATABASE_URL`. If present, force `DATABASE_URL` to that value
# before importing `app` so the application picks up the test DB config
# and does not connect to production by accident.
test_db_url = os.environ.get("TEST_DATABASE_URL")
if test_db_url:
    os.environ["DATABASE_URL"] = test_db_url

# Ensure tests have a DB-side encryption key available. Tests rely on
# `JOBTRACK_PG_KEY` for pgcrypto-based encryption/decryption; set a safe
# default here so individual tests don't need to export it in the shell.
# Use `monkeypatch.setenv()` inside individual tests when a different key
# is required for isolation.
# Force a deterministic test key for DB-side encryption so tests are
# hermetic and do not depend on the caller's shell environment. Individual
# tests may still override this value with `monkeypatch.setenv()` when they
# need to exercise alternate keys.
os.environ["JOBTRACK_PG_KEY"] = "test-integration-passphrase"

from app import app as flask_app  # noqa: E402

logger = logging.getLogger(__name__)


@pytest.fixture
def app():
    """Create and configure a test Flask application instance."""
    flask_app.config.update(
        {
            "TESTING": True,
            "DEBUG": False,
        }
    )
    yield flask_app


@pytest.fixture
def client(app) -> Generator[object, None, None]:
    """Create a test client for the Flask application."""
    # Wrap the Flask test client so tests that call legacy paths (e.g. /api/contacts)
    # continue to work by rewriting them to include a default applicant id.
    # This keeps tests fast and avoids modifying every test file.
    # Determine a sensible default applicant id for tests. Prefer to read a
    # real applicant id from the configured TEST_DATABASE_URL so integration
    # tests which expect session-based auth can use a valid applicant.
    DEFAULT_APPLICANTID = 1
    test_db_url = os.environ.get("TEST_DATABASE_URL")
    if test_db_url:
        try:
            import psycopg2

            # Query the test DB for an existing applicantid; if present use it.
            with psycopg2.connect(test_db_url) as _conn:
                with _conn.cursor() as _cur:
                    _cur.execute(
                        "SELECT applicantid FROM public.applicantprofile LIMIT 1;"
                    )
                    row = _cur.fetchone()
                    if row and row[0]:
                        DEFAULT_APPLICANTID = int(row[0])
        except Exception as e:
            # Fall back to 1 if anything goes wrong (e.g. psycopg2 unavailable)
            logger.debug("Unable to determine default applicantid, using 1: %s", e)
            DEFAULT_APPLICANTID = 1

    def _rewrite_path(path: str) -> str:
        # Only rewrite top-level API paths that don't already include an applicant id
        # e.g. "/api/contacts" -> "/api/1/contacts"
        if not path.startswith("/api/"):
            return path
        parts = path.split("/")
        # parts[0] == '' (leading slash), parts[1] == 'api'
        if len(parts) >= 3:
            # If next segment is an integer, assume path already has applicantid
            try:
                int(parts[2])
                return path
            except Exception:
                # Not an integer: inject default applicantid
                return "/api/{}/".format(DEFAULT_APPLICANTID) + "/".join(parts[2:])
        return path

    with app.test_client() as base_client:
        # Ensure the test client's session is populated with an applicantid so
        # handlers that check session-based auth (require_applicant_allowed)
        # allow the test requests. This mirrors a logged-in session in tests.
        csrf_token_value = None
        try:
            with base_client.session_transaction() as sess:
                sess["applicantid"] = DEFAULT_APPLICANTID
                # Provide a CSRF token for endpoints that check it
                sess.setdefault("csrf_token", "test-csrf-token")
                csrf_token_value = sess.get("csrf_token")
        except Exception as e:
            # session_transaction may not be available in some contexts; log and continue.
            logger.debug("session_transaction unavailable in test client: %s", e)

        # Create a thin wrapper object exposing the same methods used by tests
        class WrappedClient:
            def __init__(self, client, csrf_token=None):
                self._client = client
                self._csrf_token = csrf_token

            def _has_route(self, path: str, method: str) -> bool:
                """Return True if the Flask app has a matching rule for `path` and `method`.

                Uses the application's url_map.bind matcher to attempt to resolve
                the given path for the specified HTTP method. Errors indicate no
                matching rule.
                """
                try:
                    # Strip query string when matching against url_map
                    clean_path = path.split("?", 1)[0]
                    adapter = self._client.application.url_map.bind("localhost")
                    adapter.match(clean_path, method=method)
                    return True
                except Exception:
                    # Matching failed (no route) — return False quietly
                    return False

            def _maybe_inject_applicantid_in_json(self, data, content_type):
                # If JSON content and data is a JSON string, ensure applicantid present
                if content_type and content_type.startswith("application/json"):
                    # If no data provided, inject a minimal JSON body containing applicantid
                    if not data:
                        return json.dumps({"applicantid": DEFAULT_APPLICANTID})
                    try:
                        obj = json.loads(data)
                        if isinstance(obj, dict) and obj.get("applicantid") is None:
                            obj["applicantid"] = DEFAULT_APPLICANTID
                            return json.dumps(obj)
                    except Exception as e:
                        logger.debug(
                            "Rule matcher raised during rules evaluation: %s", e
                        )
                return data

            def get(self, path, **kwargs):
                new_path = _rewrite_path(path)
                # Use rewritten path only when it actually resolves to a route
                if new_path != path and self._has_route(new_path, "GET"):
                    return self._client.get(new_path, **kwargs)
                return self._client.get(path, **kwargs)

            def options(self, path, **kwargs):
                new_path = _rewrite_path(path)
                if new_path != path and self._has_route(new_path, "OPTIONS"):
                    return self._client.options(new_path, **kwargs)
                return self._client.options(path, **kwargs)

            def post(self, path, data=None, content_type=None, **kwargs):
                new_path = _rewrite_path(path)
                # Prefer to inject applicantid into whichever path we will call
                injected_data = self._maybe_inject_applicantid_in_json(
                    data, content_type
                )

                # If the rewritten path actually exists for POST, use it.
                # Prepare headers and include CSRF token for state-changing requests
                headers = kwargs.pop("headers", {}) or {}
                if self._csrf_token and "X-CSRF-Token" not in {
                    k.title(): v for k, v in headers.items()
                }:
                    headers["X-CSRF-Token"] = self._csrf_token

                if new_path != path and self._has_route(new_path, "POST"):
                    return self._client.post(
                        new_path,
                        data=injected_data,
                        content_type=content_type,
                        headers=headers,
                        **kwargs,
                    )

                # Otherwise call the original path but ensure applicantid and CSRF header are injected
                return self._client.post(
                    path,
                    data=injected_data,
                    content_type=content_type,
                    headers=headers,
                    **kwargs,
                )

            def put(self, path, data=None, content_type=None, **kwargs):
                new_path = _rewrite_path(path)
                injected_data = self._maybe_inject_applicantid_in_json(
                    data, content_type
                )
                headers = kwargs.pop("headers", {}) or {}
                if self._csrf_token and "X-CSRF-Token" not in {
                    k.title(): v for k, v in headers.items()
                }:
                    headers["X-CSRF-Token"] = self._csrf_token

                if new_path != path and self._has_route(new_path, "PUT"):
                    return self._client.put(
                        new_path,
                        data=injected_data,
                        content_type=content_type,
                        headers=headers,
                        **kwargs,
                    )
                return self._client.put(
                    path,
                    data=injected_data,
                    content_type=content_type,
                    headers=headers,
                    **kwargs,
                )

            def delete(self, path, data=None, content_type=None, **kwargs):
                new_path = _rewrite_path(path)
                # Ensure deletes inject a JSON body with applicantid when none provided
                content_type = content_type or "application/json"
                injected_data = self._maybe_inject_applicantid_in_json(
                    data, content_type
                )
                headers = kwargs.pop("headers", {}) or {}
                if self._csrf_token and "X-CSRF-Token" not in {
                    k.title(): v for k, v in headers.items()
                }:
                    headers["X-CSRF-Token"] = self._csrf_token

                if new_path != path and self._has_route(new_path, "DELETE"):
                    return self._client.delete(
                        new_path,
                        data=injected_data,
                        content_type=content_type,
                        headers=headers,
                        **kwargs,
                    )
                return self._client.delete(
                    path,
                    data=injected_data,
                    content_type=content_type,
                    headers=headers,
                    **kwargs,
                )

            def patch(self, path, data=None, content_type=None, **kwargs):
                new_path = _rewrite_path(path)
                injected_data = self._maybe_inject_applicantid_in_json(
                    data, content_type
                )
                headers = kwargs.pop("headers", {}) or {}
                if self._csrf_token and "X-CSRF-Token" not in {
                    k.title(): v for k, v in headers.items()
                }:
                    headers["X-CSRF-Token"] = self._csrf_token

                if new_path != path and self._has_route(new_path, "PATCH"):
                    return self._client.patch(
                        new_path,
                        data=injected_data,
                        content_type=content_type,
                        headers=headers,
                        **kwargs,
                    )
                return self._client.patch(
                    path,
                    data=injected_data,
                    content_type=content_type,
                    headers=headers,
                    **kwargs,
                )

            def __getattr__(self, name):
                # Expose other attributes like open, cookie_jar, etc.
                return getattr(self._client, name)

        yield WrappedClient(base_client, csrf_token=csrf_token_value)


@pytest.fixture
def runner(app):
    """Create a test CLI runner for the Flask application."""
    return app.test_cli_runner()


@pytest.fixture
def make_fake_db():
    """Factory fixture to create simple Fake Database context managers for tests.

    Usage:
        FakeDB = make_fake_db(fetchone=..., fetchall=...)
        monkeypatch.setattr(app_module, 'Database', FakeDB)

    `fetchone` and `fetchall` may be callables that accept the last executed
    query string and return an appropriate value, or constants.
    """

    def _factory(fetchone=None, fetchall=None, sequence=None, rules=None):
        """
        Create a FakeDB supporting flexible per-query responses.

        Parameters:
        - fetchone/fetchall: default return values or callables used when no other
          rule/sequence applies.
        - sequence: ordered list of entries consumed for successive `execute()` calls.
          Each entry may be:
            - a dict with keys `fetchone`/`fetchall` to override returns for that step,
            - a callable that accepts the executed SQL (string) and returns one of the
              above dicts or a direct value.
        - rules: an ordered list of `(matcher, response)` pairs where `matcher` is
          either a substring (str) or a compiled `re.Pattern`. The first rule whose
          matcher matches the executed SQL (case-insensitive substring or regex search)
          will be applied. `response` may be a dict, callable, or constant similar to
          `sequence` entries.

        This fixture tries `sequence` (if provided) first, then `rules`, then falls back
        to the `fetchone`/`fetchall` defaults.
        """

        seq = list(sequence) if sequence is not None else None
        rules_list = list(rules) if rules is not None else None

        class FakeCursor:
            def __init__(self):
                self._fetchone = fetchone
                self._fetchall = fetchall
                self.last_query = None
                self._seq_index = 0

            def execute(self, query, params=None):
                self.last_query = query
                q = query or ""
                # Sequence entries take precedence
                if seq is not None and self._seq_index < len(seq):
                    # Iterate through sequence entries from current index until
                    # we find one that applies to the current query. For
                    # callable entries, call them with the query; if they
                    # return None they do not apply. When an entry applies we
                    # consume it (advance the index) and apply its fetch
                    # overrides.
                    for idx in range(self._seq_index, len(seq)):
                        entry = seq[idx]
                        applied = entry
                        if callable(entry):
                            applied = entry(q)
                            if applied is None:
                                # not applicable - continue to next sequence entry
                                continue
                        # We have an applicable entry; apply and advance index
                        if isinstance(applied, dict):
                            self._fetchone = applied.get("fetchone", self._fetchone)
                            self._fetchall = applied.get("fetchall", self._fetchall)
                        else:
                            self._fetchone = applied
                        self._seq_index = idx + 1
                        return

                # Rules matching (substring or regex)
                if rules_list:
                    qlow = q.lower()
                    for matcher, resp in rules_list:
                        matched = False
                        if isinstance(matcher, str):
                            # Strict case-insensitive substring match only.
                            # The previous fuzzy token subset matching produced
                            # false positives (matching unrelated queries). Unit
                            # tests should use explicit substrings or regex
                            # patterns when they need looser matching.
                            if matcher.lower() in qlow:
                                matched = True
                        else:
                            try:
                                if matcher.search(qlow):
                                    matched = True
                            except Exception as e:
                                logger.debug(
                                    "JSON parse failed while injecting applicantid: %s",
                                    e,
                                )
                        if matched:
                            entry = resp
                            if callable(entry):
                                entry = entry(q)
                            if isinstance(entry, dict):
                                self._fetchone = entry.get("fetchone", self._fetchone)
                                self._fetchall = entry.get("fetchall", self._fetchall)
                            else:
                                self._fetchone = entry
                            return

                # No sequence/rule matched: leave defaults in place

            def fetchone(self) -> Any:
                if callable(self._fetchone):
                    result = self._fetchone(self.last_query)
                else:
                    result = self._fetchone
                # If callers supply dict-based fake responses, wrap them in
                # `RowProxy` so both positional (`row[0]`) and mapping-style
                # (`row.get('col')`) access work for production code and tests.
                if isinstance(result, dict):
                    return RowProxy(result)
                return result

            def fetchall(self) -> Any:
                if callable(self._fetchall):
                    result = self._fetchall(self.last_query)
                else:
                    result = self._fetchall or []
                # If fetchall returned a list of dicts, wrap each row in a
                # `RowProxy` to provide both mapping and positional access.
                if isinstance(result, list):
                    new = []
                    for row in result:
                        if isinstance(row, dict):
                            new.append(RowProxy(row))
                        else:
                            new.append(row)
                    return new
                return result

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        class FakeConn:
            def __init__(self):
                self._committed = False

            def cursor(self, cursor_factory=None):
                return FakeCursor()

            def commit(self):
                self._committed = True

            def rollback(self):
                self._committed = False

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                if exc_type is None:
                    self.commit()
                else:
                    self.rollback()
                return False

        class FakeDB:
            def __enter__(self):
                return FakeConn()

            def __exit__(self, exc_type, exc, tb):
                return False

        return FakeDB

    return _factory


@pytest.fixture(autouse=True)
def _prevent_unmarked_db_writes(request, monkeypatch):
    """Autouse fixture that prevents tests from opening the real Database.

    By default this fixture replaces `app.Database` with a guard that raises
    if code attempts to enter a real DB context. Tests that legitimately need
    DB access should be marked with ``@pytest.mark.integration``. To opt-out
    temporarily, set the environment variable ``ALLOW_REAL_DB=1``.

    Tests that use the `monkeypatch` fixture to install their own `Database`
    implementation (for example via the project's `make_fake_db`) will be
    able to override this guard because the same `monkeypatch` instance is
    used.
    """
    # If the test is explicitly marked as integration, only allow DB access
    # when a dedicated test DB is configured via `TEST_DATABASE_URL` or
    # when the caller explicitly opts out with `ALLOW_REAL_DB=1`.
    if request.node.get_closest_marker("integration"):
        if (
            os.environ.get("TEST_DATABASE_URL")
            or os.environ.get("ALLOW_REAL_DB", "") == "1"
        ):
            yield
            return
        raise RuntimeError(
            "Integration tests require a dedicated test database. Set TEST_DATABASE_URL to your test DB URL or set ALLOW_REAL_DB=1 to opt out."
        )

    # Allow environment opt-out for special cases
    if os.environ.get("ALLOW_REAL_DB", "") == "1":
        yield
        return

    # Import the app module and replace Database with a default FakeDB
    # for unit tests so endpoints return safe empty results. Tests that need
    # specific DB behavior should install their own FakeDB via
    # `make_fake_db()` and `monkeypatch.setattr(app_module, 'Database', FakeDB)`.
    import app as app_module

    _ = app_module

    # Create a simple FakeDB that returns empty lists / None by default.
    # Use request.getfixturevalue to obtain the `make_fake_db` fixture rather
    # than calling the fixture function directly.
    factory = request.getfixturevalue("make_fake_db")
    # Provide simple rule-based responses so common INSERT ... RETURNING
    # queries (contact/org/job inserts) return a plausible id, while
    # other queries default to empty results.
    from typing import Any as _Any

    rules: list[_Any] = [
        ("returning contactid", {"fetchone": {"contactid": 1}}),
        ("returning orgid", {"fetchone": {"orgid": 1}}),
        ("returning jobid", {"fetchone": {"jobid": 1}}),
    ]
    # Also return simple rows for common SELECT existence checks so endpoints
    # that validate objects by id succeed under the default FakeDB.
    rules.extend(
        [
            (
                "select contactid from contact where contactid",
                {"fetchone": {"contactid": 1}},
            ),
            (
                "select orgid, name from organisation where orgid",
                {"fetchone": {"orgid": 1, "name": "Test Org"}},
            ),
            (
                "select orgid, name from organisation where lower(name)",
                {"fetchone": {"orgid": 1, "name": "Test Org"}},
            ),
        ]
    )
    FakeDB = factory(fetchone=None, fetchall=[], rules=rules)
    # Patch the canonical Database implementation used by the application
    # so unit tests use the FakeDB by default.
    monkeypatch.setattr("jobtrack_core.db_core.Database", FakeDB)
    yield


def get_json_or_fail(response):
    """Test helper: return JSON body or fail the test if None."""
    data = response.get_json(silent=True)
    if data is None:
        import pytest

        pytest.fail("Expected JSON response but got None")
    return data


def fetchone_not_none(cursor) -> Any:
    """Test helper: call `cursor.fetchone()` and assert it's not None.

    Returns the fetched row (often `RowProxy`) and narrows typing for tests.
    """
    res = cursor.fetchone()
    assert res is not None, "Expected fetchone() to return a row, got None"
    return res
