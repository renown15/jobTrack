-- Migration: Add avatar image URL field to applicantprofile
-- Allows users to provide a direct image URL for their avatar

BEGIN;

-- Add avatarurl field
ALTER TABLE applicantprofile 
ADD COLUMN IF NOT EXISTS avatarurl VARCHAR(500);

-- Update table comment
COMMENT ON COLUMN applicantprofile.avatarurl IS 'Direct URL to avatar image (since LinkedIn images require OAuth)';

COMMIT;
