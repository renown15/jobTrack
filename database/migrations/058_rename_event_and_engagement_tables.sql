-- 058_rename_event_and_engagement_tables.sql
-- Rename tables to use consistent no-underscore naming convention:
--   engagement_document -> engagementdocument
--   networking_event -> networkingevent
--   networking_event_task -> networkingeventtask

BEGIN;

-- Renames — use IF EXISTS to be safe on dev environments
ALTER TABLE IF EXISTS public.engagement_document RENAME TO engagementdocument;
ALTER TABLE IF EXISTS public.networking_event RENAME TO networkingevent;
ALTER TABLE IF EXISTS public.networking_event_task RENAME TO networkingeventtask;

COMMIT;
