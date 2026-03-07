-- Migration 085: Replace `latestcvsent` column on `contact` with a FK `statusid`
-- - Add referencedata rows for contact_status: 'Active' and 'Inactive'
-- - Add `statusid` integer column to `public.contact`
-- - Populate existing rows with 'Active' as a safe default
-- - Add foreign key constraint to `referencedata(refid)`
-- - Drop `latestcvsent` column
 BEGIN;

-- Ensure the contact_status reference values exist (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM referencedata WHERE refdataclass = 'contact_status' AND lower(refvalue) = lower('Active')) THEN
        INSERT INTO referencedata (refdataclass, refvalue) VALUES ('contact_status', 'Active');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM referencedata WHERE refdataclass = 'contact_status' AND lower(refvalue) = lower('Inactive')) THEN
        INSERT INTO referencedata (refdataclass, refvalue) VALUES ('contact_status', 'Inactive');
    END IF;
END$$;

-- Remove dependent view so we can alter the contact table safely

DROP VIEW IF EXISTS public.dim_contact;

-- Add the new statusid column (nullable to avoid blocking running systems)

ALTER TABLE public.contact ADD COLUMN IF NOT EXISTS statusid integer;

-- Set existing contacts to 'Active' by default (safe migration)

UPDATE public.contact
SET statusid =
    (SELECT refid
     FROM referencedata
     WHERE refdataclass = 'contact_status'
         AND lower(refvalue) = lower('Active')
     LIMIT 1)
WHERE statusid IS NULL;

-- Add foreign key constraint linking to referencedata.refid
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'contact' AND kcu.column_name = 'statusid' AND tc.constraint_type = 'FOREIGN KEY'
    ) THEN
        ALTER TABLE public.contact
            ADD CONSTRAINT contact_statusid_fkey FOREIGN KEY (statusid) REFERENCES referencedata(refid) ON DELETE SET NULL;
    END IF;
END$$;

-- Recreate the dim_contact view without referencing `latestcvsent`.

CREATE OR REPLACE VIEW public.dim_contact AS
SELECT c.contactid,
       c.name AS contact_name,
       c.currentorgid,
       org.name AS current_org_name,
       org.sectorid AS current_org_sectorid,
       sec.summary AS current_org_sector_summary,
       c.currentrole,
       c.statusid,
       rs.refvalue AS contact_status_value,
       c.islinkedinconnected,
       c.roletypeid,
       rd.refvalue AS roletype_value,
       rd.refdataclass AS roletype_class,
       c.leadid,
       l.name AS lead_name,
       l.company AS lead_company,
       c.applicantid,
       ap.firstname AS owner_firstname,
       ap.lastname AS owner_lastname,
       c.created_at,
       c.updated_at
FROM public.contact c
LEFT JOIN public.organisation org ON org.orgid = c.currentorgid
LEFT JOIN public.sector sec ON sec.sectorid = org.sectorid
LEFT JOIN public.referencedata rd ON rd.refid = c.roletypeid
LEFT JOIN public.referencedata rs ON rs.refid = c.statusid
LEFT JOIN public.lead l ON l.leadid = c.leadid
LEFT JOIN public.applicantprofile ap ON ap.applicantid = c.applicantid;

COMMENT ON VIEW public.dim_contact IS 'Dimension: contact with resolved organisation, sector, role type, lead, owner and contact status';

-- Drop the legacy column (if present)

ALTER TABLE public.contact
DROP COLUMN IF EXISTS latestcvsent;


COMMIT;
