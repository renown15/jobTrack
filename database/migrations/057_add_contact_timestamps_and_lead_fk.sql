-- 057_add_contact_timestamps_and_lead_fk.sql
-- Add nullable leadid FK to leads, add created_at/updated_at timestamps to contact,
-- drop legacy connectiontenure column, and backfill created_at from staging.
-- Backfill logic:
--  - where a row in staging.contacts_norm matches contact.name (case-insensitive trim),
--    set contact.created_at = staging.contact_date
--  - for remaining contacts with no match, set created_at = current_date
 BEGIN;

-- Add leadid column (nullable) and timestamp columns with defaults

ALTER TABLE public.contact ADD COLUMN IF NOT EXISTS leadid integer;


ALTER TABLE public.contact ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();


ALTER TABLE public.contact ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Add FK constraint for leadid referencing leads table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'contact' AND kcu.column_name = 'leadid'
    ) THEN
        ALTER TABLE public.contact
            ADD CONSTRAINT contact_leadid_fkey FOREIGN KEY (leadid) REFERENCES public.leads(leadid) ON DELETE SET NULL;
    END IF;
END$$;

-- Drop legacy connectiontenure column if present

ALTER TABLE public.contact
DROP COLUMN IF EXISTS connectiontenure;

-- Backfill created_at from staging.contacts_norm where names match
-- Use case-insensitive trimmed matching. Only set when created_at is null.
-- If staging.contact_date is NULL for a matched row, leave for next step to set to current_date.

UPDATE public.contact c
SET created_at = s.contact_date::timestamp with time zone,
                                                     updated_at = now()
FROM staging.contacts_norm s
WHERE lower(trim(c.name)) = lower(trim(s.name))
    AND s.contact_date IS NOT NULL;

-- Set remaining NULL created_at to today's date (midnight). Set updated_at to now().

UPDATE public.contact
SET created_at = current_date,
                 updated_at = now()
WHERE created_at IS NULL;


COMMIT;

-- 058_rename_event_and_engagement_tables.sql
 BEGIN;

-- Renames — use IF EXISTS to be safe on dev environments

ALTER TABLE IF EXISTS public.engagement_document RENAME TO engagementdocument;


ALTER TABLE IF EXISTS public.networking_event RENAME TO networkingevent;


ALTER TABLE IF EXISTS public.networking_event_task RENAME TO networkingeventtask;


COMMIT;

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