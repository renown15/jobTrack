-- Migration: 008_add_applicant_auth.sql
-- Add authentication-related columns to applicantprofile

BEGIN;

ALTER TABLE public.applicantprofile
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS last_login timestamp with time zone;

-- Ensure email uniqueness exists (already present in schema.sql)

COMMIT;
