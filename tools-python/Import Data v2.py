import re
from datetime import date

import pandas as pd
import psycopg2
import psycopg2.extras

# Basic DB config - copy from original script; update as needed
DB_CONFIG = {
    "host": "localhost",
    "database": "jobtrack",
    "user": "marklewis",
    "password": "",
}

EXCEL_FILE = "/Users/marklewis/Library/CloudStorage/OneDrive-Personal/Recruitment Engagement Tracker2.xlsx"
SHEET_TRACKER = "Tracker"

DATE_PATTERN = re.compile(r"(\d{1,2}/\d{1,2}(?:/\d{2,4})?)")


def safe_read_sheet(sheet_name):
    try:
        df = pd.read_excel(EXCEL_FILE, sheet_name=sheet_name, header=0)
        df.columns = (
            df.columns.str.strip()
            .str.replace(" ", "_")
            .str.replace("/", "_")
            .str.replace(":", "")
        )
        return df
    except Exception as e:
        print("Error reading sheet", sheet_name, e)
        return pd.DataFrame()


def parse_entries_from_log(logtext, default_year=None):
    if not logtext or not isinstance(logtext, str):
        return []

    matches = list(DATE_PATTERN.finditer(logtext))
    if not matches:
        return [
            (default_year and date(default_year, 1, 1)) if default_year else None,
            logtext,
        ]

    entries = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(logtext)
        segment = logtext[start:end].strip()
        dm = DATE_PATTERN.match(segment)
        if not dm:
            continue
        date_str = dm.group(1)
        content = segment[dm.end() :].strip(" -:\n\r\t")
        parsed_date = _parse_date_str(date_str, default_year)
        entries.append((parsed_date, content))

    return entries


def _parse_date_str(date_str, default_year=None):
    parts = date_str.split("/")
    try:
        d = int(parts[0])
        m = int(parts[1])
    except Exception:
        return None
    if len(parts) >= 3 and parts[2]:
        y = int(parts[2])
        if y < 100:
            y += 2000 if y < 70 else 1900
    else:
        y = default_year or date.today().year
    try:
        return date(y, m, d)
    except Exception:
        return None


def import_tracker():
    df_tracker = safe_read_sheet(SHEET_TRACKER)
    if df_tracker.empty:
        print("No tracker data")
        return

    # Standardize column names expected
    df_tracker = (
        df_tracker.rename(
            columns={
                "Contact_Date": "LogDate",
                "Org": "OrgName",
                "Role": "CurrentRole",
                "Recruiter": "IsRecruiter",
                "Engagement_log": "LogEntry",
            }
        )
        .dropna(subset=["Name"])
        .copy()
    )

    df_tracker["LogDate"] = pd.to_datetime(
        df_tracker["LogDate"], errors="coerce", dayfirst=True
    ).dt.date

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Minimal contact detection: create contacts for unique names
    names = df_tracker["Name"].dropna().unique()
    contact_map = {}
    for name in names:
        cur.execute(
            "INSERT INTO Contact (Name) VALUES (%s) RETURNING contactid", (name,)
        )
        contact_map[name] = cur.fetchone()[0]

    # Insert engagement log entries, splitting multi-entry LogEntry fields
    log_rows = []
    for _, row in df_tracker.iterrows():
        cid = contact_map.get(row["Name"])
        if not cid:
            continue
        default_year = row["LogDate"].year if pd.notna(row["LogDate"]) else None
        entries = parse_entries_from_log(
            row.get("LogEntry", ""), default_year=default_year
        )
        for d, txt in entries:
            if d is None:
                d = row["LogDate"] if pd.notna(row["LogDate"]) else None
            log_rows.append((cid, d, txt))

    psycopg2.extras.execute_batch(
        cur,
        "INSERT INTO EngagementLog (ContactID, LogDate, LogEntry) VALUES (%s, %s, %s)",
        log_rows,
    )
    conn.commit()
    conn.close()
    print(f"Inserted {len(log_rows)} engagement rows from tracker.")


if __name__ == "__main__":
    import_tracker()
