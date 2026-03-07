### Multi-stage Dockerfile for JobTrack (Flask backend + Vite frontend)
### Builds the frontend and copies static files into the Flask app.

# Stage 1: build frontend
FROM node:18-alpine AS frontend-build
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ARG VITE_ENABLE_CLIENT_LOGS="false"
ENV VITE_ENABLE_CLIENT_LOGS=${VITE_ENABLE_CLIENT_LOGS}
WORKDIR /app/frontend
COPY frontend/package*.json frontend/yarn.lock* ./
RUN npm ci --silent
COPY frontend/ .
# Allow build to pick up Vite env var at build-time (pass --build-arg VITE_API_BASE_URL)
RUN npm run build

# Stage 2: python runtime
FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system deps required for psycopg2 and general build
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev gcc curl libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml poetry.lock* /app/
COPY . /app

# Install Python dependencies. We rely on pyproject; fallback to pip install .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir .

# Remove build-time packages to reduce final image size
RUN apt-get remove --purge -y build-essential gcc g++ make patch dpkg-dev \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy the frontend build into a location the Flask app can serve
COPY --from=frontend-build /app/frontend/dist /app/backend/frontend/dist

# Ensure uploads dir exists (can be mounted to a Fly volume)
# Note: uploads are stored in the database, not on the filesystem.
# Do not create or rely on an uploads directory in the image.

ENV FLASK_APP=app.py
ENV PYTHONPATH=/app/backend
ENV PORT=8080

# Expose port
EXPOSE 8080

# Use gunicorn to serve the Flask app and send access/error logs to stdout
# so they appear in `docker logs` for easier debugging.
# Create an unprivileged user and ensure runtime files are owned by it.
# Do this as root during image build, then drop privileges with USER.
RUN groupadd -r jobtrack \
    && useradd -r -g jobtrack -m -d /home/jobtrack -s /sbin/nologin jobtrack \
    && chown -R jobtrack:jobtrack /app /app/static/navigator_uploads

# Drop privileges for runtime
USER jobtrack

# Use a shell form so `$PORT` environment variable is expanded at runtime.
# Fly.io (and some orchestrators) set `$PORT`; default to 8080 for local runs.
CMD ["sh", "-lc", "exec gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 3 --threads 4 --timeout 120 --access-logfile - --error-logfile - app:app"]
