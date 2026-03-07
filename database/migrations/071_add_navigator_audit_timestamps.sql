-- Migration 071: Add created_at and updated_at timestamps to navigator tables
-- Date: 2025-12-01

BEGIN;

-- Add audit timestamps to navigatoraction
ALTER TABLE public.navigatoraction
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.navigatoraction
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Add audit timestamps to navigatoractioninput
ALTER TABLE public.navigatoractioninput
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.navigatoractioninput
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

COMMIT;

-- End migration 071
