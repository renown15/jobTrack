-- Migration: 054
-- Purpose: Add `applicantid` to non-reference data tables so rows can be partitioned
-- by applicant. This is a staged / non-destructive migration which adds the
-- column, backfills an initial value (ASSUMES a single existing applicant id=1),
-- enforces NOT NULL and adds UNIQUE constraints on (applicantid, id). It DOES NOT
-- replace existing primary keys or foreign keys (these are destructive and
-- require a coordinated multi-step migration and application changes).

-- IMPORTANT: Create a full DB backup before running this migration.

BEGIN;

-- Assumption: existing legacy data belongs to applicantid = 1. If you have
-- multiple applicant profiles already, do not run this migration until you
-- have a mapping strategy for existing rows.

-- 1) Add applicantid column (nullable) to each target table
ALTER TABLE public.contact ADD COLUMN IF NOT EXISTS applicantid integer NULL;
ALTER TABLE public.organisation ADD COLUMN IF NOT EXISTS applicantid integer NULL;
ALTER TABLE public.jobrole ADD COLUMN IF NOT EXISTS applicantid integer NULL;
ALTER TABLE public.engagementlog ADD COLUMN IF NOT EXISTS applicantid integer NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS applicantid integer NULL;
ALTER TABLE public.contacttargetorganisation ADD COLUMN IF NOT EXISTS applicantid integer NULL;
ALTER TABLE public.document ADD COLUMN IF NOT EXISTS applicantid integer NULL;
ALTER TABLE public.engagement_document ADD COLUMN IF NOT EXISTS applicantid integer NULL;
ALTER TABLE public.tasktarget ADD COLUMN IF NOT EXISTS applicantid integer NULL;
ALTER TABLE public.taskactionlog ADD COLUMN IF NOT EXISTS applicantid integer NULL;

-- 2) Backfill applicantid for existing rows to 1 (change if your existing
-- default applicant id differs)
UPDATE public.contact SET applicantid = 1 WHERE applicantid IS NULL;
UPDATE public.organisation SET applicantid = 1 WHERE applicantid IS NULL;
UPDATE public.jobrole SET applicantid = 1 WHERE applicantid IS NULL;
UPDATE public.engagementlog SET applicantid = 1 WHERE applicantid IS NULL;
UPDATE public.leads SET applicantid = 1 WHERE applicantid IS NULL;
UPDATE public.contacttargetorganisation SET applicantid = 1 WHERE applicantid IS NULL;
UPDATE public.document SET applicantid = 1 WHERE applicantid IS NULL;
UPDATE public.engagement_document SET applicantid = 1 WHERE applicantid IS NULL;
UPDATE public.tasktarget SET applicantid = 1 WHERE applicantid IS NULL;
UPDATE public.taskactionlog SET applicantid = 1 WHERE applicantid IS NULL;

-- 3) Make applicantid NOT NULL now rows are backfilled
ALTER TABLE public.contact ALTER COLUMN applicantid SET NOT NULL;
ALTER TABLE public.organisation ALTER COLUMN applicantid SET NOT NULL;
ALTER TABLE public.jobrole ALTER COLUMN applicantid SET NOT NULL;
ALTER TABLE public.engagementlog ALTER COLUMN applicantid SET NOT NULL;
ALTER TABLE public.leads ALTER COLUMN applicantid SET NOT NULL;
ALTER TABLE public.contacttargetorganisation ALTER COLUMN applicantid SET NOT NULL;
ALTER TABLE public.document ALTER COLUMN applicantid SET NOT NULL;
ALTER TABLE public.engagement_document ALTER COLUMN applicantid SET NOT NULL;
ALTER TABLE public.tasktarget ALTER COLUMN applicantid SET NOT NULL;
ALTER TABLE public.taskactionlog ALTER COLUMN applicantid SET NOT NULL;

-- 4) Add foreign key relationship to applicantprofile for data integrity
ALTER TABLE public.contact ADD CONSTRAINT contact_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;
ALTER TABLE public.organisation ADD CONSTRAINT organisation_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;
ALTER TABLE public.jobrole ADD CONSTRAINT jobrole_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;
ALTER TABLE public.engagementlog ADD CONSTRAINT engagementlog_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;
ALTER TABLE public.leads ADD CONSTRAINT leads_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;
ALTER TABLE public.contacttargetorganisation ADD CONSTRAINT cto_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;
ALTER TABLE public.document ADD CONSTRAINT document_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;
ALTER TABLE public.engagement_document ADD CONSTRAINT engagement_document_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;
ALTER TABLE public.tasktarget ADD CONSTRAINT tasktarget_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;
ALTER TABLE public.taskactionlog ADD CONSTRAINT taskactionlog_applicantid_fkey FOREIGN KEY (applicantid) REFERENCES public.applicantprofile(applicantid) ON DELETE CASCADE;

-- 5) Add UNIQUE constraints to enforce (applicantid, id) uniqueness so
-- application code can rely on composite uniqueness prior to a full PK swap
ALTER TABLE public.contact ADD CONSTRAINT uq_contact_applicant_contactid UNIQUE (applicantid, contactid);
ALTER TABLE public.organisation ADD CONSTRAINT uq_organisation_applicant_orgid UNIQUE (applicantid, orgid);
ALTER TABLE public.jobrole ADD CONSTRAINT uq_jobrole_applicant_jobid UNIQUE (applicantid, jobid);
ALTER TABLE public.engagementlog ADD CONSTRAINT uq_engagementlog_applicant_engagementlogid UNIQUE (applicantid, engagementlogid);
ALTER TABLE public.leads ADD CONSTRAINT uq_leads_applicant_leadid UNIQUE (applicantid, leadid);
ALTER TABLE public.contacttargetorganisation ADD CONSTRAINT uq_cto_applicant_id UNIQUE (applicantid, id);
ALTER TABLE public.document ADD CONSTRAINT uq_document_applicant_documentid UNIQUE (applicantid, documentid);
ALTER TABLE public.engagement_document ADD CONSTRAINT uq_engdoc_applicant_id UNIQUE (applicantid, engagement_document_id);
ALTER TABLE public.tasktarget ADD CONSTRAINT uq_tasktarget_applicant_id UNIQUE (applicantid, id);
ALTER TABLE public.taskactionlog ADD CONSTRAINT uq_taskactionlog_applicant_id UNIQUE (applicantid, id);

-- 6) Add helpful indexes for common queries
CREATE INDEX IF NOT EXISTS idx_contact_applicantid ON public.contact (applicantid);
CREATE INDEX IF NOT EXISTS idx_jobrole_applicantid ON public.jobrole (applicantid);
CREATE INDEX IF NOT EXISTS idx_engagementlog_applicantid ON public.engagementlog (applicantid);
CREATE INDEX IF NOT EXISTS idx_leads_applicantid ON public.leads (applicantid);

COMMIT;

-- NOTES / NEXT STEPS:
-- - This migration keeps existing primary keys intact to avoid cascading FK
--   changes. After updating application code to always include `applicantid` in
--   queries, you can follow up with a breaking migration that drops old PKs and
--   recreates PKs as composite (applicantid, id), and updates all foreign keys
--   to reference the composite keys. That follow-up must be executed with care
--   (and downtime) and requires updating all SQL code and ORMs.
-- - If you do NOT want to backfill to `applicantid = 1`, change the UPDATE
--   statements above to map existing rows to the correct applicant ids instead.
-- - Run tests and review application code to ensure joins and WHERE clauses
--   include `applicantid` where needed.
