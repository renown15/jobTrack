-- Migration: add binary storage for uploaded documents
-- Adds columns for storing file bytes and metadata in the central `document` table.

-- Add simpler, canonical columns for content storage used by the application:
-- - documentcontenttype: mime type / content type of the stored document
-- - documentcontent: binary content blob

ALTER TABLE public.document
    ADD COLUMN IF NOT EXISTS documentcontenttype varchar(255),
    ADD COLUMN IF NOT EXISTS documentcontent bytea;

-- Keep migration minimal: the frontend and backend will use these two columns.
