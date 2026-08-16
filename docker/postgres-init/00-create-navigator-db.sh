#!/bin/sh
set -eu

nav_db_name="${NAVIGATOR_DB_NAME:-jobtrack_navigator_ai}"

db_exists="$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${nav_db_name}'")"

if [ "$db_exists" != "1" ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c "CREATE DATABASE \"${nav_db_name}\";"
fi