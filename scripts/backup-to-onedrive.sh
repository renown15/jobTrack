#!/bin/bash
# Discover all running Postgres containers, dump every user database,
# and upload to OneDrive under pi-backups/<app-name>/.
set -euo pipefail

ONEDRIVE_DEST="onedrive:pi-backups"
BACKUP_DIR="/tmp/pi-db-backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
KEEP_DAYS=30
NTFY_TOPIC="renown15-12a-pub"

notify() {
    local title="$1" message="$2" priority="${3:-default}"
    curl -s -o /dev/null \
        -H "Title: $title" \
        -H "Priority: $priority" \
        -d "$message" \
        "https://ntfy.sh/$NTFY_TOPIC" || true
}

trap 'notify "Pi backup FAILED" "Backup script failed at $(date). Check /var/log/pi-backup.log" "urgent"' ERR

mkdir -p "$BACKUP_DIR"

# Find running containers whose image looks like postgres or pgvector
containers=$(docker ps --format '{{.Names}}\t{{.Image}}' \
    | awk '$2 ~ /postgres|pgvector/ {print $1}')

if [ -z "$containers" ]; then
    echo "No Postgres containers running — nothing to back up."
    exit 0
fi

for container in $containers; do
    # Prefer the compose project name as the app name; fall back to container name
    app=$(docker inspect "$container" \
        --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null)
    [ -n "$app" ] || app="$container"

    # Get the superuser name from the container environment
    pg_user=$(docker inspect "$container" \
        --format '{{range .Config.Env}}{{println .}}{{end}}' \
        | grep '^POSTGRES_USER=' | cut -d= -f2)
    pg_user="${pg_user:-postgres}"

    # List all non-system databases
    databases=$(docker exec "$container" \
        psql -U "$pg_user" -d postgres -tAc \
        "SELECT datname FROM pg_database
         WHERE datistemplate = false
           AND datname NOT IN ('postgres')" 2>/dev/null || true)

    if [ -z "$databases" ]; then
        echo "[$app] No user databases found in $container — skipping."
        continue
    fi

    app_dir="$BACKUP_DIR/$app"
    mkdir -p "$app_dir"

    for db in $databases; do
        outfile="$app_dir/${db}_${TIMESTAMP}.pgdump"
        echo "[$app] Dumping $db..."
        docker exec "$container" pg_dump -Fc -U "$pg_user" "$db" > "$outfile"
    done

    echo "[$app] Uploading to $ONEDRIVE_DEST/$app/ ..."
    rclone copy "$app_dir" "$ONEDRIVE_DEST/$app" \
        --include "*_${TIMESTAMP}.pgdump"
done

echo "Pruning local backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -name "*.pgdump" -mtime "+${KEEP_DAYS}" -delete

echo "Done."
