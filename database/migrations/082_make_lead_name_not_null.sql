-- Migration 082: Make lead.name NOT NULL
-- 1) Populate missing or empty names with best available value
-- 2) Set the column to NOT NULL

BEGIN;

-- Set name to first non-empty of existing name, email, linkedinurl, company, or 'Unknown'
UPDATE public.lead
SET name = COALESCE(NULLIF(trim(name),''), NULLIF(trim(email),''), NULLIF(trim(linkedinurl),''), NULLIF(trim(company),''), 'Unknown')
WHERE name IS NULL OR trim(name) = '';

-- Ensure all rows satisfy NOT NULL constraint
ALTER TABLE public.lead ALTER COLUMN name SET NOT NULL;

COMMIT;
