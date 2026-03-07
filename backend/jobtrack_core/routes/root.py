from flask import Blueprint, redirect
import os

api = Blueprint("root", __name__)


@api.route("/", methods=["GET"])
def landing_page():
    """Landing page handler moved from monolith.

    This will attempt to redirect to the frontend app; fall back to a
    minimal HTML string when the dist build is not present.
    """
    try:
        return redirect("/app/", code=302)
    except Exception:
        try:
            dist_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
            dist_dir = os.path.normpath(dist_dir)
            index_path = os.path.join(dist_dir, "index.html")
            if os.path.exists(index_path):
                with open(index_path, "r", encoding="utf-8") as f:
                    return (f.read(), 200)
        except Exception:
            pass
    return (
        "<html><head><title>JobTrack</title></head><body><h1>JobTrack</h1><p>Welcome to JobTrack — personal job search tracker.</p></body></html>",
        200,
    )
