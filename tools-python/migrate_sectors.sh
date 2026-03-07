#!/bin/bash
# ============================================================================
# Sector Consolidation Migration Script
# Safely executes the sector consolidation with preview and rollback options
# ============================================================================

set -e  # Exit on error

DB_NAME="jobtrack"
MIGRATION_FILE="tools/migrations/004_consolidate_sectors.sql"
BACKUP_DIR="tools/migrations/backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "============================================================================"
echo "  JobTrack Sector Consolidation Migration"
echo "============================================================================"
echo ""

# Function to create a full backup
create_backup() {
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="${BACKUP_DIR}/sector_backup_${TIMESTAMP}.sql"
    
    echo -e "${BLUE}📦 Creating full backup...${NC}"
    
    psql -d "$DB_NAME" -c "\COPY (SELECT * FROM sector) TO '${BACKUP_FILE}.sector.csv' WITH CSV HEADER"
    psql -d "$DB_NAME" -c "\COPY (SELECT orgid, sectorid FROM organisation WHERE sectorid IS NOT NULL) TO '${BACKUP_FILE}.org_sectors.csv' WITH CSV HEADER"
    
    echo -e "${GREEN}✅ Backup created:${NC}"
    echo "   - ${BACKUP_FILE}.sector.csv"
    echo "   - ${BACKUP_FILE}.org_sectors.csv"
    echo ""
}

# Function to show current state
show_current_state() {
    echo -e "${BLUE}📊 Current Sector Distribution:${NC}"
    psql -d "$DB_NAME" -c "
        SELECT 
            s.summary,
            COUNT(o.orgid) as org_count
        FROM sector s
        LEFT JOIN organisation o ON s.sectorid = o.sectorid
        GROUP BY s.summary
        ORDER BY org_count DESC, s.summary;
    "
    
    echo ""
    psql -d "$DB_NAME" -c "
        SELECT 
            COUNT(*) as total_sectors
        FROM sector;
    "
    echo ""
}

# Function to run migration in transaction (review before commit)
run_migration_interactive() {
    echo -e "${YELLOW}⚠️  This will execute the migration in an OPEN TRANSACTION${NC}"
    echo -e "${YELLOW}   You will review the results, then decide to COMMIT or ROLLBACK${NC}"
    echo ""
    read -p "Continue? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        echo -e "${RED}❌ Cancelled${NC}"
        exit 1
    fi
    
    # Create backup first
    create_backup
    
    echo -e "${BLUE}🚀 Executing migration...${NC}"
    echo ""
    
    # Run migration (it will pause at the end for review)
    psql -d "$DB_NAME" -f "$MIGRATION_FILE"
}

# Function to commit the migration
commit_migration() {
    echo -e "${BLUE}💾 Committing changes...${NC}"
    psql -d "$DB_NAME" -c "COMMIT;"
    echo -e "${GREEN}✅ Migration committed successfully!${NC}"
    echo ""
    show_current_state
}

# Function to rollback the migration
rollback_migration() {
    echo -e "${YELLOW}🔄 Rolling back changes...${NC}"
    psql -d "$DB_NAME" -c "ROLLBACK;"
    echo -e "${GREEN}✅ Migration rolled back - no changes made${NC}"
}

# Function to restore from backup
restore_from_backup() {
    echo -e "${YELLOW}Available backups:${NC}"
    find "${BACKUP_DIR}" -name "*sector*.csv" -type f -exec ls -lh {} \; 2>/dev/null || echo "No backups found"
    echo ""
    read -p "Enter backup timestamp (YYYYMMDD_HHMMSS): " timestamp
    
    SECTOR_FILE="${BACKUP_DIR}/sector_backup_${timestamp}.sql.sector.csv"
    ORG_FILE="${BACKUP_DIR}/sector_backup_${timestamp}.sql.org_sectors.csv"
    
    if [ ! -f "$SECTOR_FILE" ] || [ ! -f "$ORG_FILE" ]; then
        echo -e "${RED}❌ Backup files not found${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}🔄 Restoring from backup...${NC}"
    
    psql -d "$DB_NAME" <<EOF
BEGIN;

-- Clear current data
DELETE FROM sector;

-- Restore sectors
\COPY sector FROM '${SECTOR_FILE}' WITH CSV HEADER

-- Restore organisation sectors
UPDATE organisation SET sectorid = NULL;
CREATE TEMP TABLE temp_org_sectors (orgid INTEGER, sectorid INTEGER);
\COPY temp_org_sectors FROM '${ORG_FILE}' WITH CSV HEADER
UPDATE organisation o SET sectorid = t.sectorid FROM temp_org_sectors t WHERE o.orgid = t.orgid;
DROP TABLE temp_org_sectors;

COMMIT;
EOF
    
    echo -e "${GREEN}✅ Restore complete${NC}"
    show_current_state
}

# Main menu
case "${1:-menu}" in
    "preview"|"--preview"|"-p")
        echo -e "${BLUE}Preview Mode - Current State${NC}"
        echo ""
        show_current_state
        ;;
    
    "execute"|"--execute"|"-e")
        run_migration_interactive
        ;;
    
    "commit"|"--commit"|"-c")
        commit_migration
        ;;
    
    "rollback"|"--rollback"|"-r")
        rollback_migration
        ;;
    
    "restore"|"--restore")
        restore_from_backup
        ;;
    
    "backup"|"--backup"|"-b")
        create_backup
        ;;
    
    "help"|"--help"|"-h")
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  preview   (-p)  Show current sector distribution"
        echo "  execute   (-e)  Run migration (creates backup, runs in transaction)"
        echo "  commit    (-c)  Commit the migration (after reviewing results)"
        echo "  rollback  (-r)  Rollback the migration (if not yet committed)"
        echo "  backup    (-b)  Create a backup without running migration"
        echo "  restore         Restore from a previous backup"
        echo "  help      (-h)  Show this help"
        echo ""
        echo "Typical workflow:"
        echo "  1. ./migrate_sectors.sh preview    # Review current state"
        echo "  2. ./migrate_sectors.sh execute    # Run migration in transaction"
        echo "  3. Review the output carefully"
        echo "  4. ./migrate_sectors.sh commit     # Commit if happy"
        echo "     OR"
        echo "     ./migrate_sectors.sh rollback   # Rollback if issues"
        ;;
    
    *)
        echo -e "${BLUE}JobTrack Sector Consolidation${NC}"
        echo ""
        echo "Choose an option:"
        echo "  1) Preview current state"
        echo "  2) Execute migration (with backup)"
        echo "  3) Commit migration"
        echo "  4) Rollback migration"
        echo "  5) Create backup only"
        echo "  6) Restore from backup"
        echo "  7) Help"
        echo ""
        read -p "Enter choice [1-7]: " choice
        
        case $choice in
            1) $0 preview ;;
            2) $0 execute ;;
            3) $0 commit ;;
            4) $0 rollback ;;
            5) $0 backup ;;
            6) $0 restore ;;
            7) $0 help ;;
            *) echo -e "${RED}Invalid choice${NC}" ;;
        esac
        ;;
esac
