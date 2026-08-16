-- 008_add_documents_and_cleanup.sql
-- Migration: add Document table, create reference data classes (document_type, next_step),
-- migrate contact.currentnextstep -> contact.next_step_refid, add engagement_documents join table,
-- remove deprecated columns from organisation/contact/jobrole/sector, and normalize empty strings/NaN to NULL.
--
-- IMPORTANT: Review and run in a staging environment first. This migration takes backups of modified tables.

ROLLBACK;

BEGIN;

-- 1) Back up tables we will modify/drop columns from

CREATE TABLE IF NOT EXISTS contact_backup_pre_008 AS
SELECT *
FROM public.contact;


CREATE TABLE IF NOT EXISTS organisation_backup_pre_008 AS
SELECT *
FROM public.organisation;


CREATE TABLE IF NOT EXISTS jobrole_backup_pre_008 AS
SELECT *
FROM public.jobrole;


CREATE TABLE IF NOT EXISTS sector_backup_pre_008 AS
SELECT *
FROM public.sector;

-- 2) Ensure referencedata has the new classes; insert seed rows for document_type
-- Use INSERT ... ON CONFLICT semantics via a CTE to avoid duplicates (assumes unique constraint on (refdataclass, refvalue))
-- Add document_type values: 'CV', 'Covering Letter'

INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT *
FROM (
      VALUES ('document_type',
              'CV'), ('document_type',
                      'Covering Letter')) AS v(refdataclass, refvalue) ON CONFLICT (refdataclass,
                                                                                    refvalue) DO NOTHING;

-- 3) Create Documents table

CREATE TABLE IF NOT EXISTS public.document (documentid integer PRIMARY KEY,
                                                               documenttypeid integer, documentname text NOT NULL,
                                                                                                         documenturi text NOT NULL,
                                                                                                                          created_at timestamptz DEFAULT now());

-- Create sequence and default for documentid

CREATE SEQUENCE IF NOT EXISTS public.document_documentid_seq
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;


ALTER SEQUENCE public.document_documentid_seq OWNED BY public.document.documentid;


ALTER TABLE ONLY public.document
ALTER COLUMN documentid
SET DEFAULT nextval('public.document_documentid_seq'::regclass);

-- FK to referencedata.document_type

ALTER TABLE public.document ADD CONSTRAINT document_documenttypeid_fkey
FOREIGN KEY (documenttypeid) REFERENCES public.referencedata(refid) ON
DELETE
SET NULL;

-- 4) Create engagement_documents join table so engagements can reference distributed documents

CREATE TABLE IF NOT EXISTS public.engagement_document (engagement_document_id integer PRIMARY KEY,
                                                                                      engagementlogid integer NOT NULL,
                                                                                                              documentid integer NOT NULL,
                                                                                                                                 created_at timestamptz DEFAULT now());


CREATE SEQUENCE IF NOT EXISTS public.engagement_document_engagement_document_id_seq
START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;


ALTER SEQUENCE public.engagement_document_engagement_document_id_seq OWNED BY public.engagement_document.engagement_document_id;


ALTER TABLE ONLY public.engagement_document
ALTER COLUMN engagement_document_id
SET DEFAULT nextval('public.engagement_document_engagement_document_id_seq'::regclass);


ALTER TABLE public.engagement_document ADD CONSTRAINT engagement_document_engagementlogid_fkey
FOREIGN KEY (engagementlogid) REFERENCES public.engagementlog(engagementlogid) ON
DELETE CASCADE;


ALTER TABLE public.engagement_document ADD CONSTRAINT engagement_document_documentid_fkey
FOREIGN KEY (documentid) REFERENCES public.document(documentid) ON
DELETE CASCADE;

-- 5) Add new contact.next_step_refid and populate from existing contact.currentnextstep values
-- Create referencedata entries for each distinct non-empty currentnextstep value
-- We use a temporary table to avoid race conditions and to dedupe

CREATE TEMP TABLE tmp_distinct_next_steps AS
SELECT DISTINCT trim(currentnextstep) AS step
FROM public.contact
WHERE currentnextstep IS NOT NULL
    AND trim(currentnextstep) <> '';

-- Insert distinct steps into referencedata as class 'next_step'

INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'next_step',
       step
FROM tmp_distinct_next_steps
WHERE NOT EXISTS
        (SELECT 1
         FROM public.referencedata r
         WHERE r.refdataclass = 'next_step'
             AND r.refvalue = tmp_distinct_next_steps.step );

-- Add the new column to contact

ALTER TABLE public.contact ADD COLUMN IF NOT EXISTS next_step_refid integer;

-- Update contact.next_step_refid by joining values

UPDATE public.contact c
SET next_step_refid = r.refid
FROM public.referencedata r
WHERE r.refdataclass = 'next_step'
    AND trim(c.currentnextstep) = r.refvalue
    AND trim(c.currentnextstep) <> '';

-- Create FK constraint

ALTER TABLE public.contact ADD CONSTRAINT contact_next_step_refid_fkey
FOREIGN KEY (next_step_refid) REFERENCES public.referencedata(refid) ON
DELETE
SET NULL;

-- 8) Clean empty strings and 'NaN' placeholders across common textual columns
-- Replace '' and 'NaN' (case-insensitive) with NULL for character-type columns in a safe loop
DO $$
DECLARE
    r record;
    v_sql text;
BEGIN
        FOR r IN
                SELECT table_schema, table_name, column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                    AND data_type IN ('character varying','text')
                    AND column_name NOT IN ('password') -- avoid accidental sensitive columns
                    -- Do NOT attempt to set referencedata.refvalue to NULL because refvalue is NOT NULL by design
                    AND NOT (table_name = 'referencedata' AND column_name = 'refvalue')
    LOOP
                -- parenthesize the OR clause to ensure correct boolean logic
                v_sql := format('UPDATE %I.%I SET %I = NULL WHERE %I IS NOT NULL AND (trim(%I) = '''' OR lower(trim(%I)) = ''nan'');', r.table_schema, r.table_name, r.column_name, r.column_name, r.column_name, r.column_name);
        EXECUTE v_sql;
    END LOOP;
END$$;

-- 9) Create backups already made above; now drop deprecated columns (if they exist)
-- Contact: drop isrecruiter, latestcontactdate, currenthasrole, latesthadcallmeeting, currentcommitedactions, currentnextstep

ALTER TABLE public.contact
DROP COLUMN IF EXISTS isrecruiter;


ALTER TABLE public.contact
DROP COLUMN IF EXISTS latestcontactdate;


ALTER TABLE public.contact
DROP COLUMN IF EXISTS currenthasrole;


ALTER TABLE public.contact
DROP COLUMN IF EXISTS latesthadcallmeeting;


ALTER TABLE public.contact
DROP COLUMN IF EXISTS currentcommitedactions;


ALTER TABLE public.contact
DROP COLUMN IF EXISTS currentnextstep;

-- JobRole: drop sourcechannel and application_type columns

ALTER TABLE public.jobrole
DROP COLUMN IF EXISTS sourcechannel;


ALTER TABLE public.jobrole
DROP COLUMN IF EXISTS application_type;

-- Organisation: drop legacy boolean flags

ALTER TABLE public.organisation
DROP COLUMN IF EXISTS talentcommunitymember;


ALTER TABLE public.organisation
DROP COLUMN IF EXISTS membership_of_talent_community;

-- Sector: drop notes column

ALTER TABLE public.sector
DROP COLUMN IF EXISTS notes;

-- 10) Make sure the new referencedata rows for document_type exist (id lookup)
-- (We already inserted CV and Covering Letter above.)
 -- 11) Optional: create indexes to speed lookups

CREATE INDEX IF NOT EXISTS idx_document_documenttypeid ON public.document USING btree (documenttypeid);


CREATE INDEX IF NOT EXISTS idx_engagement_document_engagementlogid ON public.engagement_document USING btree (engagementlogid);


CREATE INDEX IF NOT EXISTS idx_engagement_document_documentid ON public.engagement_document USING btree (documentid);


CREATE INDEX IF NOT EXISTS idx_contact_next_step_refid ON public.contact USING btree (next_step_refid);

-- 12) Insert migration record into schema_migrations. Adjust version number if your system expects a different one.

INSERT INTO public.schema_migrations (version, filename)
VALUES (8, '008_add_documents_and_cleanup.sql');


COMMIT;

-- End of migration 008_add_documents_and_cleanup.sql
