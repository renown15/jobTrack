#!/bin/sh
set -eu

nav_db_name="${NAVIGATOR_DB_NAME:-jobtrack_navigator_ai}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$nav_db_name" -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'

if [ -f /seed/database/jobtrack_navigator_ai_schema.sql ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$nav_db_name" -f /seed/database/jobtrack_navigator_ai_schema.sql
fi