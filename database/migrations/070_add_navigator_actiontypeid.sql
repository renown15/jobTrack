-- Migration 070: Add actiontypeid column to navigatoraction
-- Date: 2025-12-01

BEGIN;

ALTER TABLE public.navigatoraction
  ADD COLUMN IF NOT EXISTS actiontypeid integer REFERENCES public.referencedata(refid) ON DELETE SET NULL;

-- Optional index for lookups by action type
CREATE INDEX IF NOT EXISTS idx_navigatoraction_actiontypeid ON public.navigatoraction(actiontypeid);

COMMIT;

-- End migration 070
