
import pandas as pd
import psycopg2
import psycopg2.extras

# We rely on pandas defaulting to the 'openpyxl' engine for .xlsx files.

# --- 1. CONFIGURATION ---

# !!! UPDATED WITH USER'S LOCALHOST CONFIGURATION !!!
DB_CONFIG = {
    "host": "localhost",
    "database": "jobtrack",  # Target database name (user specified lowercase)
    "user": "marklewis",
    "password": "",  # No password specified by user
}

# Define the single Excel file path and the required sheet names
# !!! FILE PATH UPDATED TO USER'S SPECIFIC LOCATION !!!
EXCEL_FILE = "/Users/marklewis/Library/CloudStorage/OneDrive-Personal/Recruitment Engagement Tracker2.xlsx"
SHEET_TRACKER = "Tracker"
SHEET_JOBS = "Jobs"
SHEET_TALENT = "Talent Communities"

# List of sheets to check for organisations
ORG_SHEETS = [SHEET_TRACKER, SHEET_JOBS, SHEET_TALENT]

# --- 2. DATABASE CONNECTION & SETUP ---


def get_db_connection():
    """Connects to the PostgreSQL database."""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = False
        return conn
    except psycopg2.Error as e:
        print(
            f"❌ Database Connection Error: {e}. Please ensure the '{DB_CONFIG['database']}' database exists and credentials are correct."
        )
        return None


def setup_database(conn):
    """Drops existing tables and recreates them based on the final PostgreSQL schema."""
    cursor = conn.cursor()

    # Drops existing tables (must be done in reverse dependency order)
    drop_sql = """
    DROP TABLE IF EXISTS role;
    DROP TABLE IF EXISTS EngagementLog;
    DROP TABLE IF EXISTS ApplicantProfile;
    DROP TABLE IF EXISTS Contact;
    DROP TABLE IF EXISTS Organisation;
    """
    cursor.execute(drop_sql)

    # Final PostgreSQL Schema DDL
    schema_sql = """
    CREATE TABLE Organisation (OrgID SERIAL PRIMARY KEY, Name VARCHAR(255) NOT NULL UNIQUE, Sector VARCHAR(100), TalentCommunityMember BOOLEAN NOT NULL DEFAULT FALSE, TalentCommunityDateAdded DATE);
    CREATE TABLE Contact (ContactID SERIAL PRIMARY KEY, Name VARCHAR(255) NOT NULL, CurrentOrgID INT, CurrentRole VARCHAR(255), IsRecruiter BOOLEAN, ConnectionTenure VARCHAR(50), LatestContactDate DATE, LatestCVSent BOOLEAN, CurrentHasRole BOOLEAN, IsLinkedInConnected BOOLEAN, LatestHadCallMeeting BOOLEAN, CurrentNextStep VARCHAR(255), CurrentCommitedActions VARCHAR(255), FOREIGN KEY (CurrentOrgID) REFERENCES Organisation(OrgID));
    CREATE TABLE ApplicantProfile (ContactID INT PRIMARY KEY, Email VARCHAR(255) UNIQUE, Phone VARCHAR(50), AddressLine1 VARCHAR(255), City VARCHAR(100), Postcode VARCHAR(20), LinkedInURL VARCHAR(255), PersonalWebsiteURL VARCHAR(255), FOREIGN KEY (ContactID) REFERENCES Contact(ContactID));
    CREATE TABLE EngagementLog (EngagementLogID SERIAL PRIMARY KEY, ContactID INT NOT NULL, LogDate DATE, LogEntry TEXT, FOREIGN KEY (ContactID) REFERENCES Contact(ContactID));
    CREATE TABLE jobrole (JobID SERIAL PRIMARY KEY, ContactID INT NOT NULL, RoleName VARCHAR(255) NOT NULL, CompanyOrgID INT, SourceChannel VARCHAR(100), ApplicationDate DATE, Status VARCHAR(50) NOT NULL DEFAULT 'Applied', FOREIGN KEY (ContactID) REFERENCES Contact(ContactID), FOREIGN KEY (CompanyOrgID) REFERENCES Organisation(OrgID));
    """

    for statement in schema_sql.split(";"):
        if statement.strip():
            cursor.execute(statement)
    conn.commit()
    print("Database schema setup complete.")


# --- 3. HELPER FUNCTIONS ---


def safe_read_sheet(sheet_name):
    """
    Reads a single sheet from the Excel file, standardizes column names,
    and prints the columns read for debugging. Includes specific error handling for XML issues.
    """
    try:
        # Attempt to read the Excel sheet.
        df = pd.read_excel(EXCEL_FILE, sheet_name=sheet_name, header=0)

        # Standardize column names (remove spaces, slashes, colons)
        original_cols = df.columns.tolist()
        df.columns = (
            df.columns.str.strip()
            .str.replace(" ", "_")
            .str.replace("/", "_")
            .str.replace(":", "")
        )

        print(f"🔎 Sheet '{sheet_name}' columns read: {original_cols}")
        print(f"   -> Standardized columns: {df.columns.tolist()}")

        return df
    except FileNotFoundError:
        # Uses the specific path in the error message now
        print(
            f"⚠️ Warning: Excel file not found at {EXCEL_FILE}. Please verify the path. Skipping."
        )
        return pd.DataFrame()
    except ValueError as e:
        error_message = str(e)
        if (
            "could not read stylesheet" in error_message
            or "invalid XML" in error_message
        ):
            print("""""" + "=" * 70)
            print("🛑 CRITICAL XML CORRUPTION ERROR DETECTED 🛑")
            print(
                f"The Excel file '{EXCEL_FILE}' has internal XML corruption (in the stylesheet or structure)."
            )
            print(
                "The Python reader cannot fix this issue, but you can. Follow the steps below and RERUN:"
            )
            print("""1. **Open** the original Excel file.""")
            print("2. **Create a NEW, BLANK Excel Workbook.**")
            print(
                "3. **Copy the ENTIRE content (data, not sheets)** of your 'Tracker', 'Jobs', and 'Talent Communities' tabs into the corresponding sheets of the **NEW** blank workbook."
            )
            print(
                "4. **Save the NEW workbook** with the same name and path: **'Recruitment Engagement Tracker.xlsx'**."
            )
            print(
                "5. **Rerun this script.** This usually resolves the XML corruption by stripping invalid styles."
            )
            print("=" * 70 + """""")
        else:
            # Handle other ValueErrors (like sheet not found)
            print(
                f"⚠️ Warning: Sheet '{sheet_name}' not found or other ValueError: {e}. Skipping. Please check sheet name casing."
            )
        return pd.DataFrame()
    except Exception as e:
        print(f"❌ An unexpected error occurred while reading sheet {sheet_name}: {e}")
        return pd.DataFrame()


def to_boolean(series):
    """Converts 'Y/N' or text values to PostgreSQL BOOLEAN (True/False)."""
    if series.dtype == "object":
        return series.str.strip().str.upper().map({"Y": True, "N": False}).fillna(False)
    # If the column is already boolean-like, use astype(bool)
    return series.astype(bool)


# --- 4. DATA PROCESSING AND INSERTION ---


def process_organisations(conn):
    """Gathers unique organisations, handles talent community data, and inserts."""
    all_orgs = set()
    talent_community_data = {}

    for sheet_name in ORG_SHEETS:
        df = safe_read_sheet(sheet_name)
        if df.empty:
            continue

        # Check for 'Company' or 'Org' column names
        if "Company" in df.columns:
            all_orgs.update(df["Company"].astype(str).str.strip().unique())
        if "Org" in df.columns:
            all_orgs.update(df["Org"].astype(str).str.strip().unique())

        if sheet_name == SHEET_TALENT:
            # Assuming the Talent Communities sheet has Company and Date as the first two columns
            df_talent = df.rename(
                columns={df.columns[0]: "Name", df.columns[1]: "DateAdded"}
            )
            df_talent = df_talent.dropna(subset=["Name"]).copy()

            for _, row in df_talent.iterrows():
                name = str(row["Name"]).strip()
                # Convert date, coerce errors to NaT (Not a Time)
                new_date = pd.to_datetime(row["DateAdded"], errors="coerce")
                if pd.notna(new_date):
                    talent_community_data[
                        name
                    ] = new_date.date()  # Store as standard date object

    all_orgs.discard("nan")
    all_orgs.discard("")

    org_data = []
    for name in sorted(list(all_orgs)):
        date_added = talent_community_data.get(name)
        is_member = True if date_added else False
        sector = None
        org_data.append((name, sector, is_member, date_added))

    cursor = conn.cursor()
    org_id_map = {}

    # If no organisations were read (due to XML error), we skip the database insert
    if not org_data:
        print(
            "⚠️ No organisation data available to insert. (Likely due to XML parsing failure)"
        )
        return org_id_map

    for name, sector, is_member, date_added in org_data:
        try:
            cursor.execute(
                """
                INSERT INTO Organisation (Name, Sector, TalentCommunityMember, TalentCommunityDateAdded) 
                VALUES (%s, %s, %s, %s)
                RETURNING "orgid"
            """,
                (name, sector, is_member, date_added),
            )
            org_id_map[name] = cursor.fetchone()[0]
        except psycopg2.errors.UniqueViolation:
            conn.rollback()
            cursor.execute("SELECT orgid FROM Organisation WHERE name = %s", (name,))
            org_id_map[name] = cursor.fetchone()[0]

    conn.commit()
    print(f"✅ Organisations inserted: {len(org_id_map)}")
    return org_id_map


def process_contacts_and_engagements(conn, org_id_map):
    """Processes Tracker data into Contact, ApplicantProfile, and EngagementLog."""
    df_tracker = safe_read_sheet(SHEET_TRACKER)
    if df_tracker.empty:
        return {}, 0

    df_tracker = (
        df_tracker.rename(
            columns={
                "Contact_Date": "LogDate",
                "Org": "OrgName",
                "Role": "CurrentRole",
                "Recruiter": "IsRecruiter",
                "CV_sent": "CVSent",
                "Has_role": "HasRole",
                "LinkedIn_Connected": "LinkedInConnected",
                "Had_a_call_meeting": "HadCallMeeting",
                "Active_next_step": "ActiveNextStep",
                "Commited_actions": "CommitedActions",
                "Engagement_log": "LogEntry",
                "Connection_tenure": "ConnectionTenure",
            }
        )
        .dropna(subset=["Name"])
        .copy()
    )

    for col in [
        "IsRecruiter",
        "CVSent",
        "HasRole",
        "LinkedInConnected",
        "HadCallMeeting",
    ]:
        if col in df_tracker.columns:
            df_tracker[col] = to_boolean(df_tracker[col])

    df_tracker["LogDate"] = pd.to_datetime(
        df_tracker["LogDate"], errors="coerce", dayfirst=True
    ).dt.date  # Use dayfirst=True for 16/09 format

    # Find the latest entry for each contact (for Contact table)
    df_latest = df_tracker.sort_values(by="LogDate", ascending=False).drop_duplicates(
        subset=["Name"], keep="first"
    )

    contact_id_map = {}
    cursor = conn.cursor()
    applicant_profile_list = []

    for index, row in df_latest.iterrows():
        org_name = str(row.get("OrgName", "")).strip()
        org_id = org_id_map.get(org_name)

        contact_data = (
            row["Name"],
            org_id,
            row["CurrentRole"],
            row["IsRecruiter"],
            row["ConnectionTenure"],
            row["LogDate"] if pd.notna(row["LogDate"]) else None,
            row["CVSent"],
            row["HasRole"],
            row["LinkedInConnected"],
            row["HadCallMeeting"],
            row["ActiveNextStep"],
            row["CommitedActions"],
        )

        cursor.execute(
            """
            INSERT INTO Contact (Name, CurrentOrgID, CurrentRole, IsRecruiter, ConnectionTenure, LatestContactDate, LatestCVSent, CurrentHasRole, IsLinkedInConnected, LatestHadCallMeeting, CurrentNextStep, CurrentCommitedActions) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING "contactid"
        """,
            contact_data,
        )

        contact_id = cursor.fetchone()[0]
        contact_id_map[row["Name"]] = contact_id

        if not row["IsRecruiter"]:
            applicant_profile_list.append((contact_id,))

    # Batch insert ApplicantProfile placeholders (profile details are currently empty)
    if applicant_profile_list:
        psycopg2.extras.execute_batch(
            cursor,
            "INSERT INTO ApplicantProfile (ContactID) VALUES (%s)",
            applicant_profile_list,
        )

    # Prepare and Insert EngagementLog data (Historical)
    log_data = []
    for index, row in df_tracker.iterrows():
        contact_id = contact_id_map.get(row["Name"])
        if contact_id and pd.notna(row["LogDate"]) and row.get("LogEntry"):
            log_data.append((contact_id, row["LogDate"], row["LogEntry"]))

    psycopg2.extras.execute_batch(
        cursor,
        """
        INSERT INTO EngagementLog (ContactID, LogDate, LogEntry) 
        VALUES (%s, %s, %s)
    """,
        log_data,
    )

    conn.commit()
    print(f"✅ Contacts and Applicant Profiles inserted: {len(contact_id_map)}")
    print(f"✅ Engagement Log entries inserted: {len(log_data)}")
    return contact_id_map


def process_job_applications(conn, org_id_map, contact_id_map):
    """Processes Jobs data into jobrole (previously JobApplication/role)."""
    df_jobs = safe_read_sheet(SHEET_JOBS)
    if df_jobs.empty:
        return 0

    df_jobs = (
        df_jobs.rename(
            columns={
                "Role": "RoleName",
                "Company": "CompanyName",
                "Channel": "SourceChannel",
                "Application_Date": "ApplicationDate",
            }
        )
        .dropna(subset=["RoleName", "CompanyName", "ApplicationDate"])
        .copy()
    )

    # Use dayfirst=False as standard dates like 2025-07-31 are fine, but be aware of mixed formats if any exist.
    df_jobs["ApplicationDate"] = pd.to_datetime(
        df_jobs["ApplicationDate"], errors="coerce"
    ).dt.date

    # ASSUMPTION: Link all applications to the first non-recruiter contact found
    cursor = conn.cursor()
    # Attempt to find the ID of the applicant created in process_contacts_and_engagements
    cursor.execute("SELECT contactid FROM Contact WHERE isrecruiter = FALSE LIMIT 1")
    result = cursor.fetchone()
    primary_applicant_id = (
        result[0] if result else next(iter(contact_id_map.values()), None)
    )

    if not primary_applicant_id:
        print(
            "🛑 Cannot insert Job Applications: No valid applicant ID found. Ensure the 'Tracker' sheet is processed correctly."
        )
        return 0

    job_data = []
    for index, row in df_jobs.iterrows():
        org_name = str(row.get("CompanyName", "")).strip()
        org_id = org_id_map.get(org_name)
        status = "Applied"  # Default status

        if pd.notna(row["ApplicationDate"]):
            job_data.append(
                (
                    primary_applicant_id,
                    row["RoleName"],
                    org_id,
                    row["SourceChannel"],
                    row["ApplicationDate"],
                    status,
                )
            )

    psycopg2.extras.execute_batch(
        cursor,
        """
        INSERT INTO jobrole (ContactID, RoleName, CompanyOrgID, SourceChannel, ApplicationDate, Status) 
        VALUES (%s, %s, %s, %s, %s, %s)
    """,
        job_data,
    )

    conn.commit()
    print(f"✅ Job Applications inserted: {len(job_data)} into jobrole")
    return len(job_data)


# --- 5. MAIN EXECUTION ---


def main():
    """Main function to orchestrate the data loading."""
    print(
        f"Starting Excel data loading from '{EXCEL_FILE}' into PostgreSQL database '{DB_CONFIG['database']}'."
    )

    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            return

        # 1. Setup the database tables (ensures the schema is correct)
        setup_database(conn)

        # 2. Insert Organisations
        org_id_map = process_organisations(conn)

        # 3. Insert Contacts and Engagement Logs
        contact_id_map = process_contacts_and_engagements(conn, org_id_map)

        # 4. Insert Job Applications
        process_job_applications(conn, org_id_map, contact_id_map)

    except Exception as e:
        print(f"""❌ An unhandled error occurred during data loading: {e}""")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()
            print("""✨ All data processing complete. Database connection closed.""")


if __name__ == "__main__":
    main()
