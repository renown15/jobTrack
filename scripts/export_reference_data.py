#!/usr/bin/env python3
"""Export referencedata and sector rows from a local JobTrack DB.

Generates an idempotent SQL seed file. By default the script will include
numeric primary keys (ids) to preserve existing identifiers. Use
`--omit-ids` to instead emit INSERTs that rely on natural keys and omit
the numeric id columns.

Usage examples:
  python scripts/export_reference_data.py --out database/seed_referencedata_and_sector.sql
  python scripts/export_reference_data.py --omit-ids --out database/seed_referencedata_and_sector.sql
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import Any

try:
    import psycopg2
except Exception:
    print(
        "Missing dependency: psycopg2. Install with `pip install psycopg2-binary`",
        file=sys.stderr,
    )
    raise


def export(dburl: str, outpath: str, omit_ids: bool = False) -> None:
    """Export referencedata and sector rows to an idempotent SQL file.

    If `omit_ids` is True the generated INSERTs will not include numeric
    id columns and will use natural-key ON CONFLICT targets. This assumes
    your schema enforces uniqueness on those natural keys (for
    `referencedata`: `(refdataclass, refvalue)`, for `sector`: `(summary)`).
    Adjust conflict targets if your schema differs.
    """

    conn = psycopg2.connect(dburl)
    try:
        cur = conn.cursor()

        def qlit(v: Any) -> str:
            """Return a SQL literal using the connection encoding via mogrify."""
            if v is None:
                return "NULL"
            b = cur.mogrify("%s", (v,))
            return b.decode(conn.encoding)

        # Fetch rows
        cur.execute(
            "SELECT refid, refdataclass, refvalue "
            "FROM public.referencedata "
            "ORDER BY refid"
        )
        refrows = cur.fetchall()

        cur.execute(
            "SELECT sectorid, summary, description "
            "FROM public.sector "
            "ORDER BY sectorid"
        )
        sectors = cur.fetchall()

        with open(outpath, "w", encoding="utf-8") as f:
            f.write("-- Generated seed SQL for referencedata and sector\n")
            f.write("-- Run in production with:\n")
            f.write(
                "--   psql -d yourdb -f database/seed_referencedata_and_sector.sql\n\n"
            )

            if refrows:
                f.write("-- referencedata\n")
                for refid, cls, val in refrows:
                    if omit_ids:
                        # Use natural key (refdataclass, refvalue)
                        line = (
                            f"INSERT INTO public.referencedata (refdataclass, refvalue) "
                            f"VALUES ({qlit(cls)}, {qlit(val)}) "
                            "ON CONFLICT (refdataclass, refvalue) DO NOTHING;\n"
                        )
                    else:
                        line = (
                            f"INSERT INTO public.referencedata (refid, refdataclass, refvalue) "
                            f"VALUES ({int(refid)}, {qlit(cls)}, {qlit(val)}) "
                            "ON CONFLICT (refid) DO NOTHING;\n"
                        )
                    f.write(line)
                f.write("""""")

            if sectors:
                f.write("-- sector\n")
                for sectorid, summary, description in sectors:
                    if omit_ids:
                        # Use `summary` as a natural key by default
                        line = (
                            f"INSERT INTO public.sector (summary, description) "
                            f"VALUES ({qlit(summary)}, {qlit(description)}) "
                            "ON CONFLICT (summary) DO NOTHING;\n"
                        )
                    else:
                        line = (
                            f"INSERT INTO public.sector (sectorid, summary, description) "
                            f"VALUES ({int(sectorid)}, {qlit(summary)}, {qlit(description)}) "
                            "ON CONFLICT (sectorid) DO NOTHING;\n"
                        )
                    f.write(line)
                f.write("""""")

        print(
            f"Wrote {outpath} ({len(refrows)} referencedata rows, {len(sectors)} sector rows)"
        )
    finally:
        conn.close()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--dburl", help="Postgres DSN (overrides DATABASE_URL env var)")
    p.add_argument(
        "--omit-ids", action="store_true", help="Omit numeric ids in INSERTs"
    )
    p.add_argument(
        "--out",
        help="Output SQL file path",
        default="database/seed_referencedata_and_sector.sql",
    )
    args = p.parse_args()

    dburl = (
        args.dburl
        or os.environ.get("DATABASE_URL")
        or os.environ.get("TEST_DATABASE_URL")
    )
    if not dburl:
        print(
            "ERROR: no database URL provided via --dburl or DATABASE_URL/TEST_DATABASE_URL env var",
            file=sys.stderr,
        )
        sys.exit(2)

    export(dburl, args.out, omit_ids=args.omit_ids)


if __name__ == "__main__":
    main()
