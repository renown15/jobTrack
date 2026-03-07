-- 059_rename_leads_to_lead.sql
-- Rename table `public.leads` to `public.lead` and adjust associated sequence/defaults.
-- Use IF EXISTS safety checks so this migration is safe to re-run on dev/staging where some steps
-- may already have been applied.

BEGIN;

-- Rename the table if present
ALTER TABLE IF EXISTS public.leads RENAME TO lead;

-- If the old sequence exists, rename it to match the new table naming convention.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'leads_leadid_seq' AND relkind = 'S') THEN
        EXECUTE 'ALTER SEQUENCE public.leads_leadid_seq RENAME TO lead_leadid_seq';
    END IF;
END$$;

-- Ensure the sequence ownership/default and set sequence value to max(id)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'lead_leadid_seq' AND relkind = 'S') THEN
        -- set sequence to the current max(leadid) to avoid nextval conflicts
        PERFORM setval('public.lead_leadid_seq', COALESCE((SELECT MAX(leadid) FROM public.lead), 1), true);
        -- update default expression on column to use the renamed sequence
        EXECUTE 'ALTER TABLE IF EXISTS public.lead ALTER COLUMN leadid SET DEFAULT nextval(''public.lead_leadid_seq''::regclass)';
    END IF;
END$$;

COMMIT;
