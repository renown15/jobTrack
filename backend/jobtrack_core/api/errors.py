"""Centralized error handling for JobTrack API.

This module provides custom exception classes and global error handlers
to ensure consistent error responses across all endpoints.

Usage in routes:
    from jobtrack_core.api.errors import NotFoundError, ValidationError

    @app.route('/api/<int:applicantid>/contacts/<int:contact_id>')
    def get_contact(applicantid, contact_id):
        contact = get_contact_from_db(contact_id, applicantid)
        if not contact:
            raise NotFoundError(f"Contact {contact_id} not found")
        return jsonify(contact)
"""

import logging
from typing import Any, Optional

import psycopg2
from flask import jsonify
from werkzeug.exceptions import HTTPException

logger = logging.getLogger(__name__)


# =============================================================================
# Custom Exception Classes
# =============================================================================


class APIError(Exception):
    """Base class for all API errors.

    Attributes:
        status_code: HTTP status code to return
        message: Human-readable error message
        details: Optional dict with additional error context
    """

    status_code = 500

    def __init__(self, message: str, details: Optional[dict] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_dict(self):
        """Convert error to JSON-serializable dict."""
        result: dict[str, Any] = {"error": self.message}
        if self.details:
            result["details"] = self.details
        return result


class ValidationError(APIError):
    """Raised when request data fails validation.

    Examples:
        - Missing required fields
        - Invalid field types
        - Field value out of range
    """

    status_code = 400


class NotFoundError(APIError):
    """Raised when a requested resource doesn't exist.

    Examples:
        - Contact not found
        - Organisation not found
        - Document not found
    """

    status_code = 404


class UnauthorizedError(APIError):
    """Raised when authentication is required but not provided.

    Examples:
        - No session/token
        - Invalid credentials
    """

    status_code = 401


class ForbiddenError(APIError):
    """Raised when user lacks permission for the requested action.

    Examples:
        - Accessing another applicant's data
        - Non-superuser accessing admin endpoints
    """

    status_code = 403


class ConflictError(APIError):
    """Raised when request conflicts with existing data.

    Examples:
        - Duplicate record (unique constraint)
        - Foreign key violation
        - Optimistic locking conflict
    """

    status_code = 409


class DatabaseError(APIError):
    """Raised when database operation fails.

    This is a catch-all for database errors that aren't more specific
    (like ConflictError). Use sparingly - prefer more specific exceptions.
    """

    status_code = 500


# =============================================================================
# Error Handler Registration
# =============================================================================


def register_error_handlers(app):
    """Register global error handlers with Flask app.

    Call this once during app initialization:
        from jobtrack_core.api.errors import register_error_handlers
        register_error_handlers(app)

    Args:
        app: Flask application instance
    """

    @app.errorhandler(APIError)
    def handle_api_error(error):
        """Handle all custom APIError subclasses."""
        response = jsonify(error.to_dict())
        response.status_code = error.status_code
        return response

    @app.errorhandler(psycopg2.IntegrityError)
    def handle_integrity_error(error):
        """Handle database integrity constraint violations."""
        logger.error(f"Database integrity error: {error}", exc_info=True)

        # Parse common integrity errors to provide better messages
        error_str = str(error).lower()

        if "duplicate key" in error_str or "unique constraint" in error_str:
            # Extract constraint name if possible
            if "key" in error_str:
                try:
                    # Example: 'duplicate key value violates unique constraint "contact_email_key"'
                    constraint = (
                        error_str.split('"')[1] if '"' in error_str else "unknown"
                    )
                    message = f"A record with these values already exists (constraint: {constraint})"
                except Exception:
                    message = "A record with these values already exists"
            else:
                message = "A record with these values already exists"

            return jsonify({"error": message, "type": "DuplicateKeyError"}), 409

        elif "foreign key" in error_str:
            message = "Referenced record not found or cannot be deleted due to existing references"
            return jsonify({"error": message, "type": "ForeignKeyError"}), 400

        elif "not-null constraint" in error_str or "null value" in error_str:
            message = "Required field is missing"
            return jsonify({"error": message, "type": "NotNullError"}), 400

        else:
            message = "Database constraint violation"
            return (
                jsonify(
                    {
                        "error": message,
                        "type": "IntegrityError",
                        "details": str(error) if app.config.get("DEBUG") else None,
                    }
                ),
                400,
            )

    @app.errorhandler(psycopg2.OperationalError)
    def handle_operational_error(error):
        """Handle database connection and operational errors."""
        logger.error(f"Database operational error: {error}", exc_info=True)

        error_str = str(error).lower()

        if "connection" in error_str or "timeout" in error_str:
            message = "Database connection error - please try again"
        else:
            message = "Database operation failed - please try again"

        return (
            jsonify({"error": message, "type": "DatabaseOperationalError"}),
            503,
        )  # Service Unavailable

    @app.errorhandler(psycopg2.Error)
    def handle_db_error(error):
        """Handle all other PostgreSQL errors."""
        logger.exception("Database error")

        return (
            jsonify(
                {
                    "error": "A database error occurred",
                    "type": error.__class__.__name__,
                    "details": str(error) if app.config.get("DEBUG") else None,
                }
            ),
            500,
        )

    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        """Handle Werkzeug HTTP exceptions (404, 405, etc.)."""
        return jsonify({"error": error.description}), error.code

    @app.errorhandler(Exception)
    def handle_generic_error(error):
        """Handle all unhandled exceptions.

        This is the catch-all handler. It should log the full exception
        but only return generic error messages in production.
        """
        logger.exception("Unhandled exception during request")

        # Don't expose internal error details in production
        if app.config.get("DEBUG") or app.config.get("TESTING"):
            message = str(error)
            error_type = error.__class__.__name__
        else:
            message = "An internal server error occurred"
            error_type = "InternalError"

        return jsonify({"error": message, "type": error_type}), 500

    logger.info("Error handlers registered successfully")


# =============================================================================
# Helper Functions
# =============================================================================


def require_field(data: dict, field: str, field_type: type = str):
    """Validate that a required field is present and of correct type.

    Args:
        data: Request data dict
        field: Field name to check
        field_type: Expected Python type

    Raises:
        ValidationError: If field is missing or wrong type

    Example:
        data = request.get_json()
        require_field(data, 'name', str)
        require_field(data, 'age', int)
    """
    if field not in data:
        raise ValidationError(
            f"Missing required field: {field}", details={"field": field}
        )

    value = data[field]

    # Allow None if explicitly checking for optional fields
    if value is None:
        raise ValidationError(
            f"Field '{field}' cannot be null", details={"field": field}
        )

    # Check type
    if not isinstance(value, field_type):
        raise ValidationError(
            f"Field '{field}' must be of type {field_type.__name__}",
            details={
                "field": field,
                "expected_type": field_type.__name__,
                "actual_type": type(value).__name__,
            },
        )

    # Additional validation for strings
    if field_type is str and isinstance(value, str) and not value.strip():
        raise ValidationError(
            f"Field '{field}' cannot be empty", details={"field": field}
        )

    return value


def validate_applicant_access(session_applicantid: int, requested_applicantid: int):
    """Validate that current user can access requested applicant's data.

    Args:
        session_applicantid: Applicant ID from session
        requested_applicantid: Applicant ID from URL/request

    Raises:
        UnauthorizedError: If not authenticated
        ForbiddenError: If accessing another applicant's data

    Example:
        session_aid = session.get('applicantid')
        validate_applicant_access(session_aid, applicantid)
    """
    if not session_applicantid:
        raise UnauthorizedError("Authentication required")

    if int(session_applicantid) != int(requested_applicantid):
        raise ForbiddenError(
            "Access denied - cannot access another applicant's data",
            details={
                "session_applicantid": session_applicantid,
                "requested_applicantid": requested_applicantid,
            },
        )
