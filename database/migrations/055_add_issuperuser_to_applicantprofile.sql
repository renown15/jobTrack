-- 055_add_issuperuser_to_applicantprofile.sql
-- Add a boolean flag to mark an applicant as a superuser
BEGIN;

ALTER TABLE applicantprofile
    ADD COLUMN IF NOT EXISTS issuperuser boolean DEFAULT FALSE;

-- Backfill: set applicant 1 as superuser (requested)
UPDATE applicantprofile SET issuperuser = TRUE WHERE applicantid = 1;

COMMIT;
