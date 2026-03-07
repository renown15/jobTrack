#!/usr/bin/env python3
"""
fix_engagement_logs.py

Scan existing EngagementLog rows where the LogEntry field contains multiple dated entries
in the form dd/mm (or dd/mm/yyyy) and split them into separate EngagementLog rows with
the correct dates. The original rows are backed up into EngagementLog_backup before
being removed.

Usage:
    python fix_engagement_logs.py [--dry-run] [--limit N]

By default this will modify the database. Use --dry-run to see what would happen.
"""

import argparse
import re
from datetime import date

import psycopg2
import psycopg2.extras

# Reuse the project's DB config - update if necessary
DB_CONFIG = {
    "host": "localhost",
    "database": "jobtrack",
    "user": "marklewis",
    "password": "",
}

DATE_PATTERN = re.compile(r"(\d{1,2}/\d{1,2}(?:/\d{2,4})?)")


def parse_entries_from_log(logtext, default_year=None):
    """Return list of (date_obj, entry_text) parsed from logtext.

    - Looks for occurrences of dd/mm or dd/mm/yyyy and splits text at those markers.
    - If a year is missing, default_year is used (if provided) else current year.
    - Dates are interpreted day-first.
    """
    if not logtext or not isinstance(logtext, str):
