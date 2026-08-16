-- 077_add_contacttarget_unique.sql
-- Add unique constraint for contacttargetorganisation to prevent duplicate target mappings
-- This migration will only add the constraint if it does not already exist.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'contacttargetorganisation_unique'
    ) THEN
        ALTER TABLE public.contacttargetorganisation
            ADD CONSTRAINT contacttargetorganisation_unique UNIQUE (contactid, targetid, applicantid);
    END IF;
EXCEPTION WHEN duplicate_object THEN
    -- If the constraint was created concurrently, ignore the error
    NULL;
END;
$$;
