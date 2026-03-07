#!/usr/bin/env bash
# JobTrack Database Management Script
# Provides utilities for backup, restore, and database operations

set -euo pipefail

# Configuration
DB_NAME="jobtrack"
DB_USER="marklewis"
BACKUP_DIR="/Users/marklewis/dev/jobTrack/database/backups"
SCHEMA_FILE="/Users/marklewis/dev/jobTrack/database/schema.sql"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}❌${NC} $1"
}

# Create backup with timestamp
backup_database() {
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="${BACKUP_DIR}/jobtrack_backup_${timestamp}.sql"
    
    log_info "Creating database backup..."
    mkdir -p "$BACKUP_DIR"
    
    pg_dump -U "$DB_USER" -d "$DB_NAME" > "$backup_file"
    
    log_success "Database backed up to: $backup_file"
    
    # Keep only last 10 backups
    cd "$BACKUP_DIR"
    ls -t jobtrack_backup_*.sql | tail -n +11 | xargs -r rm
    log_info "Cleaned up old backups (keeping 10 most recent)"
}

# Restore from backup file
restore_database() {
    local backup_file="$1"
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    log_warning "This will completely replace the current database!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Restore cancelled"
        return 0
    fi
    
    log_info "Dropping existing database..."
    dropdb -U "$DB_USER" "$DB_NAME" || true
    
    log_info "Creating new database..."
    createdb -U "$DB_USER" "$DB_NAME"
    
    log_info "Restoring from backup..."
    psql -U "$DB_USER" -d "$DB_NAME" < "$backup_file"
    
    log_success "Database restored from: $backup_file"
}

# Create fresh database from schema
reset_database() {
    log_warning "This will completely reset the database to the base schema!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Reset cancelled"
        return 0
    fi
    
    # Backup current state first
    backup_database
    
    log_info "Dropping existing database..."
    dropdb -U "$DB_USER" "$DB_NAME" || true
    
    log_info "Creating new database..."
    createdb -U "$DB_USER" "$DB_NAME"
    
    log_info "Applying base schema..."
    psql -U "$DB_USER" -d "$DB_NAME" < "$SCHEMA_FILE"
    
    log_success "Database reset to base schema"
}

# Show database status and info
status() {
    log_info "Database Status for: $DB_NAME"
    echo
    
    # Check if database exists
    if psql -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        log_success "Database exists"
        
        # Show table count
        local table_count=$(psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
        echo "Tables: $table_count"
        
        # Show record counts
        echo
        echo "Record counts:"
        psql -U "$DB_USER" -d "$DB_NAME" -c "
            SELECT 
                schemaname,
                relname as tablename,
                n_tup_ins as inserts,
                n_tup_del as deletes,
                n_live_tup as live_rows
            FROM pg_stat_user_tables 
            ORDER BY relname;
        "
        
    else
        log_error "Database does not exist"
    fi
    
    # Show recent backups
    echo
    log_info "Recent backups:"
    if [[ -d "$BACKUP_DIR" ]]; then
        ls -la "$BACKUP_DIR"/jobtrack_backup_*.sql 2>/dev/null | tail -5 || echo "No backups found"
    else
        echo "No backup directory found"
    fi
}

# List available backups
list_backups() {
    log_info "Available backups in: $BACKUP_DIR"
    
    if [[ -d "$BACKUP_DIR" ]]; then
        ls -la "$BACKUP_DIR"/jobtrack_backup_*.sql 2>/dev/null || echo "No backups found"
    else
        echo "No backup directory found"
    fi
}

# Show usage
usage() {
    echo "JobTrack Database Management"
    echo "Usage: $0 {backup|restore|reset|status|list-backups}"
    echo
    echo "Commands:"
    echo "  backup              Create a timestamped backup"
    echo "  restore <file>      Restore from backup file"
    echo "  reset               Reset database to base schema (with backup)"
    echo "  status              Show database status and info"
    echo "  list-backups        List available backup files"
    echo
    echo "Examples:"
    echo "  $0 backup"
    echo "  $0 restore tools/database/backups/jobtrack_backup_20251020_143022.sql"
    echo "  $0 reset"
}

# Main command dispatcher
case "${1:-}" in
    backup)
        backup_database
        ;;
    restore)
        if [[ -z "${2:-}" ]]; then
            log_error "Backup file path required"
            usage
            exit 1
        fi
        restore_database "$2"
        ;;
    reset)
        reset_database
        ;;
    status)
        status
        ;;
    list-backups)
        list_backups
        ;;
    *)
        usage
        exit 1
        ;;
esac