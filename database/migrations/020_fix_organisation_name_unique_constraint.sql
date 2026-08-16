-- Migration: Fix organisation name unique constraint to be scoped per applicant
-- The constraint should be on (applicantid, name) not just (name)
-- This allows different applicants to have organisations with the same name

-- Drop the incorrect global unique constraint
ALTER TABLE organisation DROP CONSTRAINT IF EXISTS organisation_name_key;

-- Add the correct applicant-scoped unique constraint
ALTER TABLE organisation ADD CONSTRAINT organisation_applicantid_name_key UNIQUE (applicantid, name);
