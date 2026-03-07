# Original content of import_sectors_from_csv.py
# (Assuming the original content is 20 lines long)
def import_sectors_from_csv(file_path):
    # Function implementation
    pass

if __name__ == "__main__":
    import_sectors_from_csv("path/to/csv")

# Additional content...

# More lines of code...

# Final lines of code...

# End of file
#!/usr/bin/env python3
"""Import sectors from sectordata.csv and update Organisation.sectorid.

Usage:
  source /Users/marklewis/dev/jobTrack/jobTrackServer/venv/bin/activate
  python tools/import_sectors_from_csv.py --csv /Users/marklewis/dev/jobTrack/sectordata.csv --dry-run
  python tools/import_sectors_from_csv.py --csv /Users/marklewis/dev/jobTrack/sectordata.csv

The script will upsert Sector by `summary` (unique), then set Organisation.sectorid by matching orgid.
On real run it writes tools/exports/org_sector_mapping.csv with mappings.
"""

import argparse
import csv
import os

import psycopg2
from psycopg2.extras import RealDictCursor

DEFAULT_DB = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "database": os.environ.get("DB_NAME", "jobtrack"),
    "user": os.environ.get("DB_USER", "marklewis"),
    "password": os.environ.get("DB_PASS", ""),
    "port": os.environ.get("DB_PORT", "5432"),
}


def build_dsn(d):
    # prefer DATABASE_URL if provided
    if os.environ.get("DATABASE_URL"):
        return os.environ.get("DATABASE_URL")
    return f"dbname={d['database']} user={d['user']} host={d['host']} port={d['port']} password={d['password']}"


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--csv", required=True, help="Path to sectordata.csv")
    p.add_argument("--dry-run", action="store_true", help="Do not commit changes")
    p.add_argument(
        "--export",
        default="tools/exports/org_sector_mapping.csv",
        help="Mapping CSV path",
    )
    p.add_argument("--db-dsn", help="Optional DSN override (postgres://...)")
    return p.parse_args()


def read_csv(path):
    rows = []
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            rows.append(
                {
                    "orgid": (r.get("orgid") or r.get("org_id") or "").strip(),
                    "org_name": (r.get("name") or r.get("Name") or "").strip(),
                    "summary": (
                        r.get("Summary Sector") or r.get("summary") or ""
                    ).strip(),
                    "description": (
                        r.get("Detailed Sector Description")
                        or r.get("description")
                        or ""
                    ).strip(),
                    "notes": (r.get("Notes") or r.get("notes") or "").strip(),
                }
            )
    return rows


def connect(dsn):
    return psycopg2.connect(dsn)


def import_sectors(
    dsn, csv_rows, dry_run=False, export_path="tools/exports/org_sector_mapping.csv"
):
    conn = connect(dsn)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    inserted_sector_summaries = set()
    mappings = []
    try:
        cur.execute("BEGIN;")

        # Upsert sectors by summary
        for r in csv_rows:
            summary = r["summary"]
            if not summary:
                continue
            cur.execute(
                """
                INSERT INTO Sector (summary, description, notes)
                VALUES (%s, NULLIF(%s, ''), NULLIF(%s, ''))
                ON CONFLICT (summary) DO UPDATE
                SET description = COALESCE(NULLIF(EXCLUDED.description, ''), Sector.description),
                    notes = COALESCE(NULLIF(EXCLUDED.notes, ''), Sector.notes)
                RETURNING sectorid, summary;
            """,
                (summary, r["description"], r["notes"]),
            )
            row = cur.fetchone()
            if row:
                inserted_sector_summaries.add(row["summary"])

        # Update organisations by matching orgid -> sector summary
        updated_count = 0
        for r in csv_rows:
            if not r["orgid"] or not r["summary"]:
                continue
            cur.execute(
                "SELECT sectorid FROM Sector WHERE summary = %s;", (r["summary"],)
            )
            s = cur.fetchone()
            if not s:
                continue
            sectorid = s["sectorid"]
            # Update Organisation where orgid equals CSV orgid
            cur.execute(
                "UPDATE Organisation SET sectorid = %s WHERE orgid = %s RETURNING orgid, name;",
                (sectorid, r["orgid"]),
            )
            u = cur.fetchone()
            if u:
                updated_count += 1
                mappings.append(
                    {
                        "orgid": u["orgid"],
                        "org_name": u.get("name"),
                        "sectorid": sectorid,
                        "sector_summary": r["summary"],
                    }
                )

        if dry_run:
            cur.execute("ROLLBACK;")
            print(
                f"DRY RUN: would upsert {len(inserted_sector_summaries)} unique sector summaries and update {len(mappings)} organisations"
            )
            print("Sample mappings:")
            for m in mappings[:10]:
                print(m)
            return {
                "sectors": len(inserted_sector_summaries),
                "updated_orgs": len(mappings),
                "mappings": mappings,
            }

        # commit and export mapping
        conn.commit()
        os.makedirs(os.path.dirname(export_path), exist_ok=True)
        with open(export_path, "w", newline="", encoding="utf-8") as out:
            writer = csv.DictWriter(
                out, fieldnames=["orgid", "org_name", "sectorid", "sector_summary"]
            )
            writer.writeheader()
            for m in mappings:
                writer.writerow(m)

        print(
            f"Imported sectors: {len(inserted_sector_summaries)}, updated organisations: {len(mappings)}"
        )
        print(f"Mapping written to {export_path}")
        return {
            "sectors": len(inserted_sector_summaries),
            "updated_orgs": len(mappings),
            "mapping_file": export_path,
        }

    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def main():
    args = parse_args()
    rows = read_csv(args.csv)
    print(f"Read {len(rows)} rows from {args.csv}")
    dsn = args.db_dsn or build_dsn(DEFAULT_DB)
    result = import_sectors(dsn, rows, dry_run=args.dry_run, export_path=args.export)
    # friendly summary
    if args.dry_run:
        print("Dry-run complete. No changes were committed.")
    else:
        print("Import complete.")


if __name__ == "__main__":
    main()
