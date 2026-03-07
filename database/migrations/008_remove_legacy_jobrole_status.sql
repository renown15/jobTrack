-- Migration: Migrate legacy jobrole.status to status_id, enforce NOT NULL, and drop legacy column
-- Date: 2025-11-11

BEGIN;

-- Ensure application_status reference rows exist
INSERT INTO ReferenceData (refdataclass, refvalue)
VALUES
  ('application_status', 'Yet to apply'),
  ('application_status', 'Applied'),
  ('application_status', 'Rejected'),
  ('application_status', 'Interview')
ON CONFLICT (refdataclass, refvalue) DO NOTHING;

-- Map legacy status text to status_id where status_id is null
DO $$
DECLARE
  yet_to_apply_id INTEGER;
  applied_id INTEGER;
  rejected_id INTEGER;
  interview_id INTEGER;
BEGIN
  SELECT refid INTO yet_to_apply_id FROM ReferenceData WHERE refdataclass = 'application_status' AND refvalue = 'Yet to apply' LIMIT 1;
  SELECT refid INTO applied_id FROM ReferenceData WHERE refdataclass = 'application_status' AND refvalue = 'Applied' LIMIT 1;
  SELECT refid INTO rejected_id FROM ReferenceData WHERE refdataclass = 'application_status' AND refvalue = 'Rejected' LIMIT 1;
  SELECT refid INTO interview_id FROM ReferenceData WHERE refdataclass = 'application_status' AND refvalue = 'Interview' LIMIT 1;

  IF yet_to_apply_id IS NOT NULL THEN
    EXECUTE format('UPDATE jobrole SET status_id = %s WHERE status = ''Yet to apply'' AND status_id IS NULL;', yet_to_apply_id);
  END IF;
  IF applied_id IS NOT NULL THEN
    EXECUTE format('UPDATE jobrole SET status_id = %s WHERE status = ''Applied'' AND status_id IS NULL;', applied_id);
  END IF;
  IF rejected_id IS NOT NULL THEN
    EXECUTE format('UPDATE jobrole SET status_id = %s WHERE status = ''Rejected'' AND status_id IS NULL;', rejected_id);
  END IF;
  IF interview_id IS NOT NULL THEN
    EXECUTE format('UPDATE jobrole SET status_id = %s WHERE status = ''Interview'' AND status_id IS NULL;', interview_id);
  END IF;

  -- As a final fallback, set any remaining NULL status_id to 'Applied' if available
  IF applied_id IS NOT NULL THEN
    EXECUTE format('UPDATE jobrole SET status_id = %s WHERE status_id IS NULL;', applied_id);
  END IF;
END $$;

-- Make status_id NOT NULL (if you want a default, we've already backfilled above)
ALTER TABLE jobrole ALTER COLUMN status_id SET NOT NULL;

-- Drop legacy status column
ALTER TABLE jobrole DROP COLUMN IF EXISTS status;

COMMIT;
