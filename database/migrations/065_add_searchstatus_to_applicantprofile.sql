-- Migration 065: add searchstatusid to applicantprofile
BEGIN;

-- Add nullable searchstatusid column

ALTER TABLE public.applicantprofile ADD COLUMN IF NOT EXISTS searchstatusid integer;

-- Add foreign key to referencedata(refid) for search statuses
-- Add foreign key to referencedata(refid) for search statuses (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_applicantprofile_searchstatusid'
    ) THEN
        EXECUTE 'ALTER TABLE public.applicantprofile
                 ADD CONSTRAINT fk_applicantprofile_searchstatusid
                 FOREIGN KEY (searchstatusid) REFERENCES public.referencedata(refid) ON DELETE SET NULL';
    END IF;
END
$$;

-- Add index for performance

CREATE INDEX IF NOT EXISTS idx_applicantprofile_searchstatusid ON public.applicantprofile(searchstatusid);


COMMIT;