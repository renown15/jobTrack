-- 060_contacttarget_polymorphic.sql
-- Rename `contacttargetorganisation` -> `contacttarget` and make target polymorphic.
-- Adds a `targettypeid` FK referencing referencedata(refid) with class `contact_target_type`.
-- Existing rows will be backfilled as `Organisation`.

BEGIN;

-- 1) Rename table to a neutral name
ALTER TABLE IF EXISTS public.contacttargetorganisation RENAME TO contacttarget;

-- 2) Rename target_orgid -> targetid
ALTER TABLE IF EXISTS public.contacttarget RENAME COLUMN IF EXISTS target_orgid TO targetid;

-- 3) Drop the existing FK to organisation (we'll keep targetid as polymorphic integer)
ALTER TABLE IF EXISTS public.contacttarget DROP CONSTRAINT IF EXISTS fk_cto_org;

-- 4) Add the new targettypeid column (nullable for now)
ALTER TABLE IF EXISTS public.contacttarget ADD COLUMN IF NOT EXISTS targettypeid integer;

-- 5) Ensure reference data rows exist for contact_target_type: 'Organisation' and 'Sector'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.referencedata WHERE lower(refdataclass) = 'contact_target_type' AND lower(refvalue) = 'organisation'
    ) THEN
        INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('contact_target_type', 'Organisation');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.referencedata WHERE lower(refdataclass) = 'contact_target_type' AND lower(refvalue) = 'sector'
    ) THEN
        INSERT INTO public.referencedata (refdataclass, refvalue) VALUES ('contact_target_type', 'Sector');
    END IF;
END$$;

-- 6) Backfill existing rows to be Organisation
DO $$
DECLARE org_ref integer;
BEGIN
    SELECT refid INTO org_ref FROM public.referencedata WHERE lower(refdataclass) = 'contact_target_type' AND lower(refvalue) = 'organisation' LIMIT 1;
    IF org_ref IS NOT NULL THEN
        UPDATE public.contacttarget SET targettypeid = org_ref WHERE targettypeid IS NULL;
    END IF;
END$$;

-- 7) Make targettypeid NOT NULL
ALTER TABLE IF EXISTS public.contacttarget ALTER COLUMN targettypeid SET NOT NULL;

-- 8) Replace the old unique constraint (contactid,target_orgid) with a polymorphic unique constraint
ALTER TABLE IF EXISTS public.contacttarget DROP CONSTRAINT IF EXISTS uq_cto;
ALTER TABLE IF EXISTS public.contacttarget ADD CONSTRAINT uq_contacttarget UNIQUE (contactid, targetid, targettypeid);

-- 9) Add FK to referencedata for targettypeid
ALTER TABLE IF EXISTS public.contacttarget ADD CONSTRAINT contacttarget_targettypeid_fkey FOREIGN KEY (targettypeid) REFERENCES public.referencedata(refid) ON DELETE RESTRICT;

-- 10) Add a helper index on targetid for faster lookups
CREATE INDEX IF NOT EXISTS idx_contacttarget_targetid ON public.contacttarget (targetid);

COMMIT;
