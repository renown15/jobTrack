-- Migration: Add application_status reference data and migrate jobrole.status to jobrole.status_id
-- Date: 2024
-- Description: Adds Interview status to existing application_status reference data,
--              migrates all legacy status varchar values to status_id FK,
--              preparing for eventual removal of status column.

BEGIN;

-- Add Interview status to application_status reference data
-- (Yet to apply, Applied, Rejected already exist as refids 36-38)
INSERT INTO ReferenceData (refdataclass, refvalue) 
VALUES ('application_status', 'Interview')
ON CONFLICT (refdataclass, refvalue) DO NOTHING;

-- Get refids for migration
DO $$
DECLARE
    yet_to_apply_id INTEGER;
    applied_id INTEGER;
    rejected_id INTEGER;
    interview_id INTEGER;
BEGIN
    SELECT refid INTO yet_to_apply_id FROM ReferenceData WHERE refdataclass = 'application_status' AND refvalue = 'Yet to apply';
    SELECT refid INTO applied_id FROM ReferenceData WHERE refdataclass = 'application_status' AND refvalue = 'Applied';
    SELECT refid INTO rejected_id FROM ReferenceData WHERE refdataclass = 'application_status' AND refvalue = 'Rejected';
    SELECT refid INTO interview_id FROM ReferenceData WHERE refdataclass = 'application_status' AND refvalue = 'Interview';

    -- Migrate legacy status varchar values to status_id
    EXECUTE format('UPDATE jobrole SET status_id = %s WHERE status = ''Yet to apply'' AND status_id IS NULL', yet_to_apply_id);
    EXECUTE format('UPDATE jobrole SET status_id = %s WHERE status = ''Applied'' AND status_id IS NULL', applied_id);
    EXECUTE format('UPDATE jobrole SET status_id = %s WHERE status = ''Rejected'' AND status_id IS NULL', rejected_id);
    EXECUTE format('UPDATE jobrole SET status_id = %s WHERE status = ''Interview'' AND status_id IS NULL', interview_id);
END $$;

-- Verify migration (optional - for logging)
SELECT 
    rd.refvalue as status_name,
    COUNT(*) as count
FROM jobrole jr
LEFT JOIN ReferenceData rd ON jr.status_id = rd.refid
GROUP BY rd.refvalue
ORDER BY rd.refvalue;

COMMIT;

-- Note: After verifying this migration works in production and UI is updated,
--       create a follow-up migration to:
--       1. Make status_id NOT NULL
--       2. Drop the legacy status varchar column
