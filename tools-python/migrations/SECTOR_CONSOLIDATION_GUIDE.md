# Sector Consolidation Migration Guide

## Overview
Consolidate 47 sectors down to 14 well-defined categories to improve data quality and analytics clarity.

## Current State
- **47 sectors** (too granular, many duplicates)
- **30 sectors** with only 1-2 organizations
- Multiple overlapping categories (e.g., 5 different Banking variations)

## Target State
- **14 consolidated sectors** (clear, non-overlapping)
- Better analytics and reporting
- Easier sector assignment for new organizations

## Consolidation Mapping

### 1. Recruitment & Executive Search (~69 orgs)
- Executive Search (42)
- Recruitment (23)
- Recruitment & Tech Services (2)
- Tech Education & Recruitment (1)
- Tech Training & Placement (1)

### 2. Banking & Financial Services (~25 orgs)
- Banking & Finance (9)
- Investment Banking (6)
- Banking & Investment (5)
- Banking (4)
- Banking & Fintech (1)

### 3. Investment & Asset Management (~9 orgs)
- Investment Management (6)
- Investment Services (1)
- Insurance & Asset Mgmt (1)
- Startup & Investment Network (1)

### 4. Private Equity (~1 org)
- Private Equity (1)

### 5. Insurance (~8 orgs)
- Insurance (2)
- Insurance & Investment (2)
- Healthcare & Insurance (1)
- Insurance & Reinsurance (1)
- Insurance & Risk (1)
- Insurance & Tech (1)

### 6. Consulting & Professional Services (~21 orgs)
- Consulting (9)
- Consulting & Tech (4)
- Consulting & Professional Services (3)
- Consulting & Advisory (1)
- Consulting & Fintech (1)
- Consulting & Risk (1)
- Consulting & Talent (1)
- Consulting & Technology (1)

### 7. Technology & Software (~16 orgs)
- Technology (4)
- Fintech (5)
- Technology & AI (1)
- Technology & Data (1)
- Technology & Infrastructure (1)
- SaaS & Analytics (1)
- IT Services & Infrastructure (1)
- Payments & Technology (2)

### 8. Financial Infrastructure (~2 orgs)
- Financial Infrastructure (2)

### 9. Information & Media Services (~3 orgs)
- Information Services (2)
- Media & Publishing (1)

### 10. Healthcare & Pharmaceuticals (~1 org)
- Pharmaceuticals & Healthcare (1)

### 11. Government (~1 org)
- Government (1)

### 12. Legal Services (~2 orgs)
- Legal Services (2)

### 13. Consumer Goods & Retail (~4 orgs)
- Beverages (1)
- Technology & Retail (1)
- Toys & Entertainment (1)

### 14. Other (~1 org)
- Unknown (1)

---

## Migration Process

### Prerequisites
- PostgreSQL access to jobtrack database
- Backup of current data (automatic)
- Review access to verify results

### Step-by-Step Execution

#### 1. Preview Current State
```bash
./tools/migrate_sectors.sh preview
```
This shows:
- Current sector distribution
- Organization counts per sector
- Total sector count

#### 2. Execute Migration (with automatic backup)
```bash
./tools/migrate_sectors.sh execute
```
This will:
- Create timestamped backup CSV files
- Run the migration in a **transaction** (not committed yet)
- Show the results for review
- **PAUSE** and wait for you to review

#### 3. Review the Results
After execution, the transaction is **OPEN** but not committed. Review:
- The new sector distribution
- Organization counts match expectations
- No data loss occurred

#### 4. Commit or Rollback

**If everything looks good:**
```bash
./tools/migrate_sectors.sh commit
```

**If something is wrong:**
```bash
./tools/migrate_sectors.sh rollback
```

### Alternative: Direct SQL Execution

You can also run the migration manually:

```bash
# Preview the migration script
cat tools/migrations/004_consolidate_sectors.sql

# Execute in psql (interactive)
psql -d jobtrack -f tools/migrations/004_consolidate_sectors.sql

# Review the output, then in the same psql session:
# COMMIT;  (if good)
# OR
# ROLLBACK;  (if issues)
```

---

## Safety Features

### 1. Automatic Backups
- Creates CSV backups before any changes
- Stored in `tools/migrations/backups/`
- Timestamp format: `sector_backup_YYYYMMDD_HHMMSS.sql`

### 2. Transaction Safety
- All changes happen in a single transaction
- Can rollback if anything looks wrong
- No partial updates

### 3. Verification Queries
The migration includes automatic verification:
- Final sector count
- Organization distribution
- Organizations without sectors

### 4. Restore Capability
If needed, restore from backup:
```bash
./tools/migrate_sectors.sh restore
```

---

## What Changes

### Database Changes
1. **New sectors created** (14 consolidated categories)
2. **organisation.sectorid updated** for all affected organizations
3. **Old sectors deleted** (33 sectors removed)

### What Doesn't Change
- Organization data (names, IDs, etc.)
- Contact data
- Engagement logs
- Any other tables

---

## Validation

After migration, verify:

```sql
-- Check sector count (should be ~14)
SELECT COUNT(*) FROM sector;

-- Check distribution
SELECT s.summary, COUNT(o.orgid) as org_count
FROM sector s
LEFT JOIN organisation o ON s.sectorid = o.sectorid
GROUP BY s.summary
ORDER BY org_count DESC;

-- Check for orgs without sector
SELECT COUNT(*) FROM organisation WHERE sectorid IS NULL;
```

---

## Rollback Plan

### If Migration Committed but Issues Found

Option 1: Restore from automatic backup
```bash
./tools/migrate_sectors.sh restore
# Enter timestamp when prompted
```

Option 2: Manual restore from CSV
```sql
-- Clear current sectors
DELETE FROM sector;

-- Restore from CSV backup
\COPY sector FROM 'tools/migrations/backups/sector_backup_TIMESTAMP.sql.sector.csv' WITH CSV HEADER

-- Restore org mappings
UPDATE organisation SET sectorid = NULL;
\COPY (CREATE TEMP TABLE temp_restore (orgid INTEGER, sectorid INTEGER)) FROM 'tools/migrations/backups/sector_backup_TIMESTAMP.sql.org_sectors.csv' WITH CSV HEADER
UPDATE organisation o SET sectorid = t.sectorid FROM temp_restore t WHERE o.orgid = t.orgid;
```

---

## Testing Checklist

After migration, test:
- [ ] Analytics dashboard loads correctly
- [ ] Sector filter in Hub view works
- [ ] Organization edit modal shows correct sectors
- [ ] Charts display proper sector groupings
- [ ] No broken foreign key references
- [ ] All organizations have valid sector assignments

---

## Files Created

1. **Migration SQL**: `tools/migrations/004_consolidate_sectors.sql`
   - Complete SQL migration script
   - Includes backup tables, updates, and verification

2. **Shell Script**: `tools/migrate_sectors.sh`
   - User-friendly wrapper
   - Handles backup, execution, commit/rollback

3. **Python Tool**: `tools/consolidate_sectors.py`
   - Alternative Python-based approach
   - More detailed preview and reporting

---

## Questions?

Common scenarios:

**Q: Can I preview without making changes?**
A: Yes! `./tools/migrate_sectors.sh preview`

**Q: What if I want to adjust the mapping?**
A: Edit `tools/migrations/004_consolidate_sectors.sql` before running

**Q: Can I test on a copy of the database first?**
A: Yes! Create a test database copy and run there first

**Q: How do I verify everything worked?**
A: The migration includes verification queries at the end

---

## Support

If issues arise:
1. Check the backup files in `tools/migrations/backups/`
2. Review the migration SQL to understand what changed
3. Use rollback if migration not yet committed
4. Use restore if already committed

---

**Ready to proceed?**

```bash
# Start here
./tools/migrate_sectors.sh preview

# When ready
./tools/migrate_sectors.sh execute

# Review results, then
./tools/migrate_sectors.sh commit
```
