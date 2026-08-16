from flask import (
    Blueprint,
    request,
    send_from_directory,
    send_file,
    Response,
    render_template,
)
import os
import mimetypes
import logging

api = Blueprint("static", __name__)


def _send_file_partial(path: str):
    try:
        file_size = os.path.getsize(path)
        range_header = request.headers.get("Range")
        if not range_header:
            return send_file(path)
        units, _, range_spec = range_header.partition("=")
        if units != "bytes":
            return send_file(path)
        start_str, sep, end_str = range_spec.partition("-")
        try:
            start = int(start_str) if start_str else 0
        except Exception:
            start = 0
        try:
            end = int(end_str) if end_str else file_size - 1
        except Exception:
            end = file_size - 1
        if end >= file_size:
            end = file_size - 1
        if start > end:
            start = 0
        length = end - start + 1
        with open(path, "rb") as fh:
            fh.seek(start)
            data = fh.read(length)
        content_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
            "Content-Type": content_type,
        }
        return Response(data, status=206, headers=headers)
    except Exception:
        logging.getLogger(__name__).exception("Partial file send failed for %s", path)
        return send_file(path)


@api.route("/assets/<path:filename>")
def serve_frontend_asset(filename):
    try:
        assets_dir = os.path.join(
            os.path.dirname(__file__), "..", "..", "frontend", "dist", "assets"
        )
        assets_dir = os.path.normpath(assets_dir)
        asset_path = os.path.join(assets_dir, filename)
        if os.path.exists(asset_path):
            range_header = request.headers.get("Range")
            if range_header:
                return _send_file_partial(asset_path)
            return send_from_directory(assets_dir, filename)
    except Exception:
        logging.getLogger(__name__).exception(
            "Failed to serve frontend asset: %s", filename
        )
    return ("Not Found", 404)


@api.route("/app/assets/<path:filename>")
def serve_frontend_app_asset(filename):
    try:
        assets_dir = os.path.join(
            os.path.dirname(__file__), "..", "..", "frontend", "dist", "assets"
        )
        assets_dir = os.path.normpath(assets_dir)
        asset_path = os.path.join(assets_dir, filename)
        if os.path.exists(asset_path):
            range_header = request.headers.get("Range")
            if range_header:
                return _send_file_partial(asset_path)
            return send_from_directory(assets_dir, filename)
    except Exception:
        logging.getLogger(__name__).exception(
            "Failed to serve frontend asset (app base): %s", filename
        )
    return ("Not Found", 404)


@api.route("/app/", methods=["GET"])
@api.route("/app", methods=["GET"])
def serve_frontend_app_index():
    try:
        dist_dir = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
        dist_dir = os.path.normpath(dist_dir)
        index_path = os.path.join(dist_dir, "index.html")
        if os.path.exists(index_path):
            return send_from_directory(dist_dir, "index.html")
        # Fallback to backend template if frontend build not present
        try:
            return render_template("landing.html")
        except Exception:
            pass
    except Exception:
        logging.getLogger(__name__).exception("Failed to serve frontend index at /app/")
    return ("Not Found", 404)


@api.route("/app/<path:filename>", methods=["GET"])
def serve_frontend_app_file(filename):
    try:
        dist_dir = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
        dist_dir = os.path.normpath(dist_dir)
        file_path = os.path.join(dist_dir, filename)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return send_from_directory(dist_dir, filename)
        index_path = os.path.join(dist_dir, "index.html")
        if os.path.exists(index_path):
            return send_from_directory(dist_dir, "index.html")
    except Exception:
        logging.getLogger(__name__).exception(
            "Failed to serve frontend file (app base): %s", filename
        )
    return ("Not Found", 404)


@api.route("/videos/<path:filename>")
def serve_videos_asset(filename):
    try:
        videos_dir = os.path.join(
            os.path.dirname(__file__), "..", "..", "frontend", "dist", "videos"
        )
        videos_dir = os.path.normpath(videos_dir)
        file_path = os.path.join(videos_dir, filename)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            range_header = request.headers.get("Range")
            if range_header:
                return _send_file_partial(file_path)
            return send_from_directory(videos_dir, filename)
    except Exception:
        logging.getLogger(__name__).exception(
            "Failed to serve video asset: %s", filename
        )
    return ("Not Found", 404)


@api.route("/app/videos/<path:filename>")
def serve_app_videos_asset(filename):
    try:
        videos_dir = os.path.join(
            os.path.dirname(__file__), "..", "..", "frontend", "dist", "videos"
        )
        videos_dir = os.path.normpath(videos_dir)
        file_path = os.path.join(videos_dir, filename)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            range_header = request.headers.get("Range")
            if range_header:
                return _send_file_partial(file_path)
            return send_from_directory(videos_dir, filename)
    except Exception:
        logging.getLogger(__name__).exception(
            "Failed to serve video asset (app base): %s", filename
        )
    return ("Not Found", 404)
