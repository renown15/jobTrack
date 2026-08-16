-- Add created_at and updated_at to organisation
ALTER TABLE public.organisation
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.organisation
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill existing rows that may have NULL timestamps
UPDATE public.organisation SET created_at = now() WHERE created_at IS NULL;
UPDATE public.organisation SET updated_at = now() WHERE updated_at IS NULL;
