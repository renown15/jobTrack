-- Migration 072: Add sortorderid to navigatoractioninput
-- Date: 2025-12-01

ALTER TABLE public.navigatoractioninput
    ADD COLUMN IF NOT EXISTS sortorderid integer DEFAULT 0;

-- Ensure existing rows have a defined value
UPDATE public.navigatoractioninput SET sortorderid = 0 WHERE sortorderid IS NULL;

-- End migration 072
