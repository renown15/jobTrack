-- Migration: add name column to leads
-- Adds a canonical `name` column to store full name, and backfills from existing firstname/lastname
 BEGIN;


ALTER TABLE IF EXISTS leads ADD COLUMN IF NOT EXISTS name TEXT;


alter table leads
drop column lastname -- Backfill name from firstname/lastname where name is null

UPDATE leads
SET name = COALESCE(NULLIF(trim(CONCAT_WS(' ', firstname, lastname)), ''), firstname, lastname)
WHERE name IS NULL;


COMMIT;