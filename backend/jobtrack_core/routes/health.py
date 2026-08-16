from flask import Blueprint, jsonify

api = Blueprint("health", __name__)


@api.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint for monitoring and integration tests."""
    return jsonify({"status": "ok"}), 200
