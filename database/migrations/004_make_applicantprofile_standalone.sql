-- Migration: Make applicantprofile standalone (not linked to contact table)
-- The applicant is the user of the software, not a contact
-- This migration removes the foreign key and adds name fields

BEGIN;

-- Step 1: Drop the foreign key constraint
ALTER TABLE applicantprofile 
DROP CONSTRAINT IF EXISTS applicantprofile_contactid_fkey;

-- Step 2: Rename contactid to applicantid for clarity
ALTER TABLE applicantprofile 
RENAME COLUMN contactid TO applicantid;

-- Step 3: Add name fields
ALTER TABLE applicantprofile 
ADD COLUMN IF NOT EXISTS firstname VARCHAR(100),
ADD COLUMN IF NOT EXISTS lastname VARCHAR(100);

-- Step 4: Make applicantid a regular primary key (not a foreign key)
-- It's already a primary key, so we just need to ensure it's properly sequenced
-- Check if we have any data and set the sequence appropriately
DO $$
DECLARE
    max_id INTEGER;
BEGIN
    SELECT COALESCE(MAX(applicantid), 0) INTO max_id FROM applicantprofile;
    
    -- If no data exists, insert a default applicant record
    IF max_id = 0 THEN
        INSERT INTO applicantprofile (applicantid, firstname, lastname, email)
        VALUES (1, '', '', '')
        ON CONFLICT (applicantid) DO NOTHING;
        
        -- Create a sequence for applicantid if it doesn't exist
        CREATE SEQUENCE IF NOT EXISTS applicantprofile_applicantid_seq
            START WITH 2
            INCREMENT BY 1
            NO MINVALUE
            NO MAXVALUE
            CACHE 1;
            
        ALTER TABLE applicantprofile 
        ALTER COLUMN applicantid SET DEFAULT nextval('applicantprofile_applicantid_seq');
        
        -- Set sequence ownership
        ALTER SEQUENCE applicantprofile_applicantid_seq OWNED BY applicantprofile.applicantid;
    END IF;
END $$;

-- Step 5: Update table comment
COMMENT ON TABLE applicantprofile IS 'Profile information for the applicant (user of the software)';
COMMENT ON COLUMN applicantprofile.applicantid IS 'Primary key for applicant (NOT a foreign key to contact)';
COMMENT ON COLUMN applicantprofile.firstname IS 'Applicant first name';
COMMENT ON COLUMN applicantprofile.lastname IS 'Applicant last name';

COMMIT;
