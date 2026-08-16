-- Migration: Add SearchStartDate column to applicantprofile
-- Adds a DATE column `searchstartdate` which will be used to store the start date used for searching/filtering
-- This column is nullable by default. Run with a backup in place in production.
 BEGIN;

-- Add the column if it does not already exist

ALTER TABLE applicantprofile ADD COLUMN IF NOT EXISTS searchstartdate DATE;

-- Add a helpful comment on the new column
COMMENT ON COLUMN applicantprofile.searchstartdate IS 'Date when applicant started search; set by Settings -> Applicant profile';


COMMIT;