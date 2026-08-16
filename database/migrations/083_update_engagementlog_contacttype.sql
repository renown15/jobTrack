-- Migration: 083_update_engagementlog_contacttype.sql
-- Add contacttype and contactgroup linkage to engagementlog

-- Add columns
ALTER TABLE public.engagementlog ADD COLUMN IF NOT EXISTS contacttypeid integer;
ALTER TABLE public.engagementlog ADD COLUMN IF NOT EXISTS contactgroupid integer;

-- Allow contactid to be nullable (engagement may link to a group instead)
ALTER TABLE public.engagementlog ALTER COLUMN contactid DROP NOT NULL;

-- Seed referencedata entries for engagement_contact_type if not present
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'engagement_contact_type', 'Individual Contact'
WHERE NOT EXISTS (
  SELECT 1 FROM public.referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower('Individual Contact')
);
INSERT INTO public.referencedata (refdataclass, refvalue)
SELECT 'engagement_contact_type', 'Contact Group'
WHERE NOT EXISTS (
  SELECT 1 FROM public.referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower('Contact Group')
);

-- Populate contacttypeid for existing rows as Individual Contact where possible
DO $$
DECLARE
  indiv_refid integer;
BEGIN
  SELECT refid INTO indiv_refid FROM public.referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower('Individual Contact') LIMIT 1;
  IF indiv_refid IS NOT NULL THEN
    UPDATE public.engagementlog SET contacttypeid = indiv_refid WHERE contactid IS NOT NULL;
  END IF;
END$$;

-- Add foreign keys
-- Ensure existing contactid FK will not block nullable contactid: recreate with ON DELETE SET NULL
ALTER TABLE public.engagementlog DROP CONSTRAINT IF EXISTS engagementlog_contactid_fkey;
ALTER TABLE ONLY public.engagementlog ADD CONSTRAINT engagementlog_contactid_fkey FOREIGN KEY (contactid) REFERENCES public.contact(contactid) ON DELETE SET NULL;

ALTER TABLE ONLY public.engagementlog ADD CONSTRAINT engagementlog_contacttypeid_fkey FOREIGN KEY (contacttypeid) REFERENCES public.referencedata(refid) ON DELETE RESTRICT;
ALTER TABLE ONLY public.engagementlog ADD CONSTRAINT engagementlog_contactgroupid_fkey FOREIGN KEY (contactgroupid) REFERENCES public.contactgroup(contactgroupid) ON DELETE SET NULL;

-- Add a CHECK constraint to enforce that contacttypeid corresponds to which id is set.
-- If the referencedata rows are available, use their refids; otherwise, fall back to requiring at least one of contactid/contactgroupid.
DO $$
DECLARE
  indiv_refid integer;
  group_refid integer;
  exists_check boolean;
BEGIN
  SELECT refid INTO indiv_refid FROM public.referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower('Individual Contact') LIMIT 1;
  SELECT refid INTO group_refid FROM public.referencedata WHERE refdataclass = 'engagement_contact_type' AND lower(refvalue) = lower('Contact Group') LIMIT 1;
  IF indiv_refid IS NOT NULL AND group_refid IS NOT NULL THEN
    -- drop existing constraint if present
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engagementlog_contacttype_cons') THEN
      ALTER TABLE public.engagementlog DROP CONSTRAINT engagementlog_contacttype_cons;
    END IF;
    EXECUTE format('ALTER TABLE public.engagementlog ADD CONSTRAINT engagementlog_contacttype_cons CHECK ((contacttypeid IS NULL) OR (contacttypeid = %s AND contactid IS NOT NULL AND contactgroupid IS NULL) OR (contacttypeid = %s AND contactgroupid IS NOT NULL AND contactid IS NULL))', indiv_refid, group_refid);
  ELSE
    -- fallback constraint: at least one of contactid or contactgroupid must be set
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engagementlog_contacttype_cons') THEN
      ALTER TABLE public.engagementlog DROP CONSTRAINT engagementlog_contacttype_cons;
    END IF;
    ALTER TABLE public.engagementlog ADD CONSTRAINT engagementlog_contacttype_cons CHECK (contactid IS NOT NULL OR contactgroupid IS NOT NULL);
  END IF;
END$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_engagementlog_contacttypeid ON public.engagementlog USING btree (contacttypeid);
CREATE INDEX IF NOT EXISTS idx_engagementlog_contactgroupid ON public.engagementlog USING btree (contactgroupid);

-- Note: Application logic must interpret (contacttypeid) to decide whether to use (contactid) or (contactgroupid).
