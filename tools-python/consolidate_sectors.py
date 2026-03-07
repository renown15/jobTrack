#!/usr/bin/env python3
"""
Sector Consolidation Tool
Consolidates 47 sectors down to 14 manageable categories.
"""

import sys
from datetime import datetime

import psycopg2
from psycopg2.extras import RealDictCursor

# Database configuration
DB_CONFIG = {
    'host': 'localhost',
    'database': 'jobtrack',
    'user': 'marklewis',
    'password': ''
}

# Sector consolidation mapping
# Format: 'New Sector Name': [list of old sector names to merge]
SECTOR_MAPPING = {
    'Recruitment & Executive Search': [
        'Executive Search',
        'Recruitment',
        'Recruitment & Tech Services',
        'Tech Education & Recruitment',
        'Tech Training & Placement'
    ],
    'Banking & Financial Services': [
        'Banking & Finance',
        'Investment Banking',
        'Banking & Investment',
        'Banking',
        'Banking & Fintech'
    ],
    'Investment & Asset Management': [
        'Investment Management',
        'Investment Services',
        'Insurance & Asset Mgmt',
        'Startup & Investment Network'
    ],
    'Private Equity': [
        'Private Equity'
    ],
    'Insurance': [
        'Insurance',
        'Insurance & Investment',
        'Healthcare & Insurance',
        'Insurance & Reinsurance',
        'Insurance & Risk',
        'Insurance & Tech'
    ],
    'Consulting & Professional Services': [
        'Consulting',
        'Consulting & Tech',
        'Consulting & Professional Services',
        'Consulting & Advisory',
        'Consulting & Fintech',
        'Consulting & Risk',
        'Consulting & Talent',
        'Consulting & Technology'
    ],
    'Technology & Software': [
        'Technology',
        'Fintech',
        'Technology & AI',
        'Technology & Data',
        'Technology & Infrastructure',
        'SaaS & Analytics',
        'IT Services & Infrastructure',
        'Payments & Technology'
    ],
    'Financial Infrastructure': [
        'Financial Infrastructure'
    ],
    'Information & Media Services': [
        'Information Services',
        'Media & Publishing'
    ],
    'Healthcare & Pharmaceuticals': [
        'Pharmaceuticals & Healthcare'
    ],
    'Government': [
        'Government'
    ],
    'Legal Services': [
        'Legal Services'
    ],
    'Consumer Goods & Retail': [
        'Beverages',
        'Technology & Retail',
        'Toys & Entertainment'
    ],
    'Other': [
        'Unknown'
    ]
}


def connect_db():
    """Connect to the database."""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        sys.exit(1)


def get_sector_info(conn):
    """Get all sectors with organization counts."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT 
                s.sectorid, 
                s.summary, 
                COUNT(o.orgid) as org_count
            FROM sector s
            LEFT JOIN organisation o ON s.sectorid = o.sectorid
            GROUP BY s.sectorid, s.summary
            ORDER BY s.summary
        """)
        return cur.fetchall()


def create_backup(conn):
    """Create a backup SQL file of current sector mappings."""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_file = f'sector_backup_{timestamp}.sql'
    
    print(f"""📦 Creating backup: {backup_file}""")
    
    with conn.cursor() as cur:
        # Backup sector table
        cur.execute("SELECT * FROM sector ORDER BY sectorid")
        sectors = cur.fetchall()
        
        # Backup organisation sector mappings
        cur.execute("SELECT orgid, sectorid FROM organisation WHERE sectorid IS NOT NULL ORDER BY orgid")
        org_sectors = cur.fetchall()
    
    with open(backup_file, 'w') as f:
        f.write("-- Sector Consolidation Backup\n")
        f.write(f"-- Created: {datetime.now().isoformat()}\n\n")
        
        f.write("-- Original Sector Table\n")
        for sector in sectors:
            f.write(f"-- INSERT INTO sector (sectorid, summary, description, notes) VALUES ({sector[0]}, '{sector[1]}', {sector[2]}, {sector[3]});\n")
        
        f.write("""-- Original Organisation Sector Mappings
""")
        for org in org_sectors:
            f.write(f"-- UPDATE organisation SET sectorid = {org[1]} WHERE orgid = {org[0]};\n")
    
    print(f"✅ Backup saved to: {backup_file}")
    return backup_file


def preview_consolidation(conn):
    """Show what will happen without making changes."""
    print("""""" + "="*80)
    print("SECTOR CONSOLIDATION PREVIEW")
    print("="*80)
    
    sectors = get_sector_info(conn)
    sector_dict = {s['summary']: s for s in sectors}
    
    total_orgs_affected = 0
    new_sector_count = 0
    
    for new_sector, old_sectors in SECTOR_MAPPING.items():
        org_count = sum(sector_dict.get(old, {}).get('org_count', 0) for old in old_sectors)
        total_orgs_affected += org_count
        new_sector_count += 1
        
        print(f"""📊 {new_sector}""")
        print(f"   Total Organizations: {org_count}")
        print("   Merging from:")
        
        for old_sector in old_sectors:
            if old_sector in sector_dict:
                info = sector_dict[old_sector]
                print(f"      • {old_sector} ({info['org_count']} orgs) [ID: {info['sectorid']}]")
            else:
                print(f"      ⚠️  {old_sector} (NOT FOUND IN DATABASE)")
    
    print("""""" + "="*80)
    print("SUMMARY:")
    print(f"  Current sectors: {len(sectors)}")
    print(f"  New sectors: {new_sector_count}")
    print(f"  Total organizations: {total_orgs_affected}")
    print(f"  Reduction: {len(sectors) - new_sector_count} sectors ({((len(sectors) - new_sector_count) / len(sectors) * 100):.1f}%)")
    print("="*80)


def apply_consolidation(conn, dry_run=True):
    """Apply the sector consolidation."""
    if dry_run:
        print("""🔍 DRY RUN MODE - No changes will be made""")
        preview_consolidation(conn)
        return
    
    print("""🚀 APPLYING CONSOLIDATION...""")
    
    sectors = get_sector_info(conn)
    sector_dict = {s['summary']: s for s in sectors}
    
    try:
        with conn.cursor() as cur:
            # Start transaction
            cur.execute("BEGIN")
            
            updates_made = 0
            sectors_created = 0
            sectors_to_delete = []
            
            for new_sector, old_sectors in SECTOR_MAPPING.items():
                print(f"""📝 Processing: {new_sector}""")
                
                # Check if new sector exists, create if not
                cur.execute("SELECT sectorid FROM sector WHERE summary = %s", (new_sector,))
                result = cur.fetchone()
                
                if result:
                    new_sector_id = result[0]
                    print(f"   ✓ Using existing sector ID: {new_sector_id}")
                else:
                    cur.execute(
                        "INSERT INTO sector (summary, description) VALUES (%s, %s) RETURNING sectorid",
                        (new_sector, f"Consolidated sector created on {datetime.now().strftime('%Y-%m-%d')}")
                    )
                    new_sector_id = cur.fetchone()[0]
                    sectors_created += 1
                    print(f"   ✓ Created new sector ID: {new_sector_id}")
                
                # Update all organizations from old sectors to new sector
                for old_sector in old_sectors:
                    if old_sector in sector_dict:
                        old_sector_id = sector_dict[old_sector]['sectorid']
                        org_count = sector_dict[old_sector]['org_count']
                        
                        if old_sector == new_sector:
                            print(f"   → {old_sector} (keeping as-is, {org_count} orgs)")
                        else:
                            cur.execute(
                                "UPDATE organisation SET sectorid = %s WHERE sectorid = %s",
                                (new_sector_id, old_sector_id)
                            )
                            print(f"   → {old_sector}: Updated {org_count} orgs from ID {old_sector_id} to {new_sector_id}")
                            
                            # Mark old sector for deletion if it's not the new one
                            if old_sector_id != new_sector_id:
                                sectors_to_delete.append(old_sector_id)
                            
                            updates_made += org_count
            
            # Delete old unused sectors
            if sectors_to_delete:
                print(f"""🗑️  Deleting {len(sectors_to_delete)} unused sectors...""")
                cur.execute(
                    "DELETE FROM sector WHERE sectorid = ANY(%s)",
                    (list(set(sectors_to_delete)),)
                )
            
            # Commit transaction
            cur.execute("COMMIT")
            
            print("""""" + "="*80)
            print("✅ CONSOLIDATION COMPLETE!")
            print(f"   • Sectors created: {sectors_created}")
            print(f"   • Organizations updated: {updates_made}")
            print(f"   • Old sectors deleted: {len(set(sectors_to_delete))}")
            print("="*80)
            
    except Exception as e:
        print(f"""❌ Error during consolidation: {e}""")
        print("   Rolling back changes...")
        conn.rollback()
        raise


def verify_consolidation(conn):
    """Verify the consolidation was successful."""
    print("""🔍 VERIFICATION:""")
    
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Count sectors
        cur.execute("SELECT COUNT(*) as count FROM sector")
        sector_count = cur.fetchone()['count']
        
        # Count orgs without sectors
        cur.execute("SELECT COUNT(*) as count FROM organisation WHERE sectorid IS NULL")
        orgs_without_sector = cur.fetchone()['count']
        
        # Get new sector distribution
        cur.execute("""
            SELECT 
                s.summary, 
                COUNT(o.orgid) as org_count
            FROM sector s
            LEFT JOIN organisation o ON s.sectorid = o.sectorid
            GROUP BY s.summary
            ORDER BY org_count DESC, s.summary
        """)
        distribution = cur.fetchall()
    
    print(f"""   Total sectors: {sector_count}""")
    print(f"   Orgs without sector: {orgs_without_sector}")
    print("""   Distribution:""")
    for row in distribution:
        print(f"      • {row['summary']}: {row['org_count']} orgs")


def main():
    """Main execution."""
    print("="*80)
    print("JobTrack Sector Consolidation Tool")
    print("="*80)
    
    # Parse arguments
    dry_run = True
    if len(sys.argv) > 1:
        if sys.argv[1] in ['--apply', '-a', '--execute', '-e']:
            dry_run = False
        elif sys.argv[1] in ['--help', '-h']:
            print("""Usage:""")
            print("  python consolidate_sectors.py              # Preview mode (dry run)")
            print("  python consolidate_sectors.py --apply      # Apply changes")
            print("  python consolidate_sectors.py --help       # Show this help")
            sys.exit(0)
    
    # Connect to database
    print("""📡 Connecting to database...""")
    conn = connect_db()
    print("✅ Connected")
    
    if dry_run:
        # Preview mode
        preview_consolidation(conn)
        print("""💡 To apply these changes, run:""")
        print("   python consolidate_sectors.py --apply")
    else:
        # Apply mode
        print("""⚠️  WARNING: This will modify your database!""")
        print("   Press Ctrl+C now to cancel, or")
        response = input("   Type 'yes' to continue: ")
        
        if response.lower() != 'yes':
            print("❌ Cancelled")
            sys.exit(0)
        
        # Create backup
        backup_file = create_backup(conn)
        
        # Apply changes
        apply_consolidation(conn, dry_run=False)
        
        # Verify
        verify_consolidation(conn)
        
        print(f"""💾 Backup saved to: {backup_file}""")
        print("   Use this file to restore if needed")
    
    conn.close()
    print("""✅ Done!
""")


if __name__ == '__main__':
    main()
