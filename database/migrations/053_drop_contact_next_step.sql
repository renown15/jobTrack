-- 053_drop_contact_next_step.sql
-- Drop legacy contact.next_step_refid (migrated to tasks / action plan)
-- This migration removes the foreign key, index and column from contact.

BEGIN;

-- Safety: only proceed if column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'contact' AND column_name = 'next_step_refid'
    ) THEN
        -- Drop foreign key constraint if present
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_schema = 'public' AND tc.table_name = 'contact' AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'next_step_refid'
        ) THEN
            ALTER TABLE public.contact DROP CONSTRAINT IF EXISTS contact_next_step_refid_fkey;
        END IF;

        -- Drop index if present
        DROP INDEX IF EXISTS idx_contact_next_step_refid;

        -- Finally drop the column
        ALTER TABLE public.contact DROP COLUMN IF EXISTS next_step_refid;
    END IF;
END
$$;

COMMIT;
