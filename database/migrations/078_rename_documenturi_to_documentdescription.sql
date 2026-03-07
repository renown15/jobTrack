-- Migration: 078_rename_documenturi_to_documentdescription.sql
-- Rename legacy `documenturi` column to `documentdescription` and update dependent views.
 BEGIN;

-- 1) Rename the column on the document table

ALTER TABLE public.document RENAME COLUMN documenturi TO documentdescription;

-- 2) Add a helpful comment on the new column
COMMENT ON COLUMN public.document.documentdescription IS 'User-provided file description or link (replaces legacy documenturi)';

-- 3) If the dim_document view exposes the old column name `documenturi`, rename the view column
-- Use a DO block with exception handling to make this migration safe when the view or column
-- doesn't exist (e.g., when applying to a fresh DB that will recreate the view later).
DO $$
BEGIN
    BEGIN
        ALTER VIEW public.dim_document RENAME COLUMN documenturi TO documentdescription;
    EXCEPTION WHEN undefined_column THEN
        -- If the view doesn't have the old column name, ignore and continue
        NULL;
    END;
EXCEPTION WHEN undefined_table THEN
    -- View doesn't exist yet; nothing to rename
    NULL;
END;
$$;

-- 4) Recreate the view selecting the new column name (safe even if the view already exists)

CREATE OR REPLACE VIEW public.dim_document AS
SELECT d.documentid,
       d.documenttypeid,
       rd.refvalue AS document_type_value,
       d.documentname,
       d.documentdescription,
       d.created_at,
       d.applicantid
FROM public.document d
LEFT JOIN public.referencedata rd ON rd.refid = d.documenttypeid;

COMMENT ON VIEW public.dim_document IS 'Dimension: document with resolved document type';

COMMIT