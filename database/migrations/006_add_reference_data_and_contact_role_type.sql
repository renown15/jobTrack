-- Migration 006: Add Reference Data Classes and Update Contact Role Type
-- Date: 2025-11-04
-- Description: 
--   1. Add new reference data classes for application_status, contact_role_type, and source_channel
--   2. Replace Contact.isrecruiter with role_type_id referencing referencedata
--   3. Add new columns to jobrole table for enhanced tracking
--   4. Migrate existing isrecruiter data to role_type_id

-- =============================================================================
-- Part 1: Add New Reference Data Classes
-- =============================================================================

-- Application Status reference data
INSERT INTO referencedata (refdataclass, refvalue) 
VALUES 
    ('application_status', 'Yet to apply'),
    ('application_status', 'Applied'),
    ('application_status', 'Rejected')
ON CONFLICT (refdataclass, refvalue) DO NOTHING;

-- Contact Role Type reference data
INSERT INTO referencedata (refdataclass, refvalue) 
VALUES 
    ('contact_role_type', 'Recruiter'),
    ('contact_role_type', 'Friend/Colleague'),
    ('contact_role_type', 'Contact'),
    ('contact_role_type', 'Interviewer')
ON CONFLICT (refdataclass, refvalue) DO NOTHING;

-- Source Channel reference data (common job search channels)
INSERT INTO referencedata (refdataclass, refvalue) 
VALUES 
    ('source_channel', 'LinkedIn'),
    ('source_channel', 'Indeed'),
    ('source_channel', 'Company Website'),
    ('source_channel', 'Recruitment Agency'),
    ('source_channel', 'Referral'),
    ('source_channel', 'Job Board'),
    ('source_channel', 'Networking Event'),
    ('source_channel', 'Direct Contact'),
    ('source_channel', 'Other')
ON CONFLICT (refdataclass, refvalue) DO NOTHING;

-- =============================================================================
-- Part 2: Update Contact Table Schema
-- =============================================================================

-- Add role_type_id column to contact table
ALTER TABLE contact 
ADD COLUMN IF NOT EXISTS role_type_id INTEGER REFERENCES referencedata(refid);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_contact_role_type ON contact(role_type_id);

-- =============================================================================
-- Part 3: Migrate Existing Data (isrecruiter -> role_type_id)
-- =============================================================================

-- Get the refids for the role types we need
DO $$
DECLARE
    recruiter_refid INTEGER;
    friend_colleague_refid INTEGER;
BEGIN
    -- Get refids for the two role types we're migrating to
    SELECT refid INTO recruiter_refid 
    FROM referencedata 
    WHERE refdataclass = 'contact_role_type' AND refvalue = 'Recruiter';
    
    SELECT refid INTO friend_colleague_refid 
    FROM referencedata 
    WHERE refdataclass = 'contact_role_type' AND refvalue = 'Friend/Colleague';
    
    -- Migrate TRUE values to 'Recruiter'
    UPDATE contact 
    SET role_type_id = recruiter_refid 
    WHERE isrecruiter = TRUE AND role_type_id IS NULL;
    
    -- Migrate FALSE/NULL values to 'Friend/Colleague'
    UPDATE contact 
    SET role_type_id = friend_colleague_refid 
    WHERE (isrecruiter = FALSE OR isrecruiter IS NULL) AND role_type_id IS NULL;
    
    RAISE NOTICE 'Contact role type migration completed';
END $$;

-- =============================================================================
-- Part 4: Update JobRole Table Schema
-- =============================================================================

-- Add status_id to reference application_status
ALTER TABLE jobrole 
ADD COLUMN IF NOT EXISTS status_id INTEGER REFERENCES referencedata(refid);

-- Add source_channel_id to reference source_channel
ALTER TABLE jobrole 
ADD COLUMN IF NOT EXISTS source_channel_id INTEGER REFERENCES referencedata(refid);

-- Add introduced_by_contactid for tracking referrals
ALTER TABLE jobrole 
ADD COLUMN IF NOT EXISTS introduced_by_contactid INTEGER REFERENCES contact(contactid);

-- Add application_type to distinguish between direct and referred applications
ALTER TABLE jobrole 
ADD COLUMN IF NOT EXISTS application_type VARCHAR(50) CHECK (application_type IN ('Direct Application', 'Introduced by contact'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobrole_status ON jobrole(status_id);
CREATE INDEX IF NOT EXISTS idx_jobrole_source_channel ON jobrole(source_channel_id);
CREATE INDEX IF NOT EXISTS idx_jobrole_introduced_by ON jobrole(introduced_by_contactid);

-- =============================================================================
-- Part 5: Migrate Existing JobRole Data
-- =============================================================================

-- Set existing jobroles to 'Applied' status if status is NULL or matches old pattern
DO $$
DECLARE
    applied_refid INTEGER;
BEGIN
    SELECT refid INTO applied_refid 
    FROM referencedata 
    WHERE refdataclass = 'application_status' AND refvalue = 'Applied';
    
    -- Migrate existing status column to status_id
    UPDATE jobrole 
    SET status_id = applied_refid 
    WHERE status_id IS NULL 
    AND (status = 'Applied' OR status IS NULL OR status = '');
    
    -- Set application_type to 'Direct Application' for existing records without contactid
    UPDATE jobrole
    SET application_type = 'Direct Application'
    WHERE application_type IS NULL AND contactid IS NULL;
    
    -- Set application_type to 'Introduced by contact' for existing records with contactid
    UPDATE jobrole
    SET application_type = 'Introduced by contact',
        introduced_by_contactid = contactid
    WHERE application_type IS NULL AND contactid IS NOT NULL;
    
    RAISE NOTICE 'JobRole migration completed';
END $$;

-- =============================================================================
-- Part 6: Add Comments for Documentation
-- =============================================================================

COMMENT ON COLUMN contact.role_type_id IS 'Contact role type: Recruiter, Friend/Colleague, Contact, or Interviewer';
COMMENT ON COLUMN contact.isrecruiter IS 'DEPRECATED: Use role_type_id instead. Kept for backward compatibility during migration.';
COMMENT ON COLUMN jobrole.status_id IS 'Application status reference ID (Yet to apply, Applied, Rejected)';
COMMENT ON COLUMN jobrole.source_channel_id IS 'Source channel reference ID (LinkedIn, Indeed, Company Website, etc.)';
COMMENT ON COLUMN jobrole.introduced_by_contactid IS 'Contact who introduced this opportunity (if applicable)';
COMMENT ON COLUMN jobrole.application_type IS 'Type of application: Direct Application or Introduced by contact';
COMMENT ON COLUMN jobrole.status IS 'DEPRECATED: Use status_id instead. Kept for backward compatibility.';

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary of changes:
-- 1. Added referencedata entries for application_status, contact_role_type, source_channel
-- 2. Added contact.role_type_id column and migrated from isrecruiter
-- 3. Enhanced jobrole table with status_id, source_channel_id, introduced_by_contactid, application_type
-- 4. Migrated existing jobrole data to new structure
-- 5. Added indexes for query performance
-- 6. Added documentation comments

-- Note: The old columns (isrecruiter, status, sourcechannel) are kept for backward compatibility
-- They can be dropped in a future migration after all application code is updated.
